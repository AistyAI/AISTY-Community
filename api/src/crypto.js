// Encryption at rest and the browser sealing key.
import crypto from "node:crypto";
import { config } from "./config.js";
import { one, query } from "./db.js";

let masterKey = null;
const key = () => (masterKey ||= Buffer.from(config.masterKey, "base64"));

export function seal(plaintext, aad) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(String(aad)));
  const ct = Buffer.concat([cipher.update(Buffer.from(String(plaintext), "utf8")), cipher.final()]);
  return `v1.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${ct.toString("base64")}`;
}

export function open(sealed, aad) {
  const [v, iv, tag, ct] = String(sealed).split(".");
  if (v !== "v1" || !iv || !tag || ct === undefined) throw new Error("Unrecognised sealed value");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(String(aad)));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

export const sealJson = (value, aad) => seal(JSON.stringify(value ?? null), aad);
export const openJson = (sealed, aad) => (sealed ? JSON.parse(open(sealed, aad)) : null);

export const sha256 = (text) => crypto.createHash("sha256").update(String(text)).digest("hex");
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const uuid = () => crypto.randomUUID();

// Settings held sealed in app_settings

async function sealedSetting(name, create) {
  const row = await one("SELECT value FROM app_settings WHERE key = $1", [name]);
  if (row) return JSON.parse(open(row.value.sealed, `setting:${name}`));
  const fresh = create();
  await query(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
    [name, { sealed: seal(JSON.stringify(fresh), `setting:${name}`) }],
  );
  // Another replica may have won the insert: read back whatever stands.
  const stored = await one("SELECT value FROM app_settings WHERE key = $1", [name]);
  return JSON.parse(open(stored.value.sealed, `setting:${name}`));
}

// Browser sealing key (RSA-OAEP-SHA256): credentials are encrypted to it before they are sent.

let sealingKey = null;
export async function getSealingKey() {
  if (sealingKey) return sealingKey;
  const stored = await sealedSetting("browser_sealing_key", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 3072 });
    return {
      kid: crypto.randomBytes(8).toString("hex"),
      publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
    };
  });
  sealingKey = { ...stored, privateKeyObject: crypto.createPrivateKey(stored.privateKey) };
  return sealingKey;
}

const MAX_SEAL_AGE_MS = 10 * 60 * 1000;

/** Open a blob sealed in the browser by sealing.js. Returns its fields. */
export async function openBrowserSealed(blob, provider, companyId) {
  if (!blob || blob.v !== 1) throw Object.assign(new Error("Credentials must be sealed in the browser."), { statusCode: 400 });
  const k = await getSealingKey();
  if (blob.kid !== k.kid) throw Object.assign(new Error("The encryption key changed. Reload and try again."), { statusCode: 409 });
  const raw = crypto.privateDecrypt(
    { key: k.privateKeyObject, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(blob.key, "base64"),
  );
  const ct = Buffer.from(blob.ct, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", raw, Buffer.from(blob.iv, "base64"));
  decipher.setAAD(Buffer.from(`${provider}:${companyId}`));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  const plain = JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString("utf8"));
  if (!plain?.iat || Math.abs(Date.now() - plain.iat) > MAX_SEAL_AGE_MS) {
    throw Object.assign(new Error("Sealed credentials expired. Try again."), { statusCode: 400 });
  }
  return plain.fields || {};
}

// Export signing key (Ed25519)

export async function getSigningKey() {
  const stored = await sealedSetting("export_signing_key", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    return {
      publicKey: publicKey.export({ type: "spki", format: "pem" }),
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
    };
  });
  return stored;
}

export async function signDocument(text) {
  const k = await getSigningKey();
  return { publicKey: k.publicKey, signature: crypto.sign(null, Buffer.from(text), k.privateKey).toString("base64") };
}

export async function deploymentId() {
  const row = await sealedSetting("deployment_id", () => ({ id: crypto.randomUUID() }));
  return row.id;
}
