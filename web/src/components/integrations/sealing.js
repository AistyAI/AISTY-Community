// Credentials are encrypted in the browser so they are unreadable in transit, including at TLS-terminating proxies.

const encode = (text) => new TextEncoder().encode(text);

function toB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromB64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function subtle() {
  const s = window.crypto?.subtle;
  if (!s) throw new Error("This browser cannot encrypt credentials (Web Crypto unavailable). Use an up-to-date browser over HTTPS.");
  return s;
}

/** Seal `fields` with the server key `info` ({ alg, kid, publicKey }). */
export async function sealFields(info, provider, companyId, fields) {
  const s = subtle();
  const serverKey = await s.importKey("spki", fromB64(info.publicKey), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const aesKey = await s.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ct = await s.encrypt(
    { name: "AES-GCM", iv, additionalData: encode(`${provider}:${companyId}`) },
    aesKey,
    encode(JSON.stringify({ iat: Date.now(), fields }))
  );
  const wrapped = await s.encrypt({ name: "RSA-OAEP" }, serverKey, await s.exportKey("raw", aesKey));
  return { v: 1, alg: info.alg, kid: info.kid, key: toB64(wrapped), iv: toB64(iv), ct: toB64(ct) };
}

// A one-time key pair for receiving a secret from the server (the SCIM token).
export async function createResponseKey() {
  const s = subtle();
  const pair = await s.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false,
    ["decrypt"]
  );
  return { privateKey: pair.privateKey, publicKey: toB64(await s.exportKey("spki", pair.publicKey)) };
}

/** Open a blob the server sealed to a response key. */
export async function openSealed(privateKey, sealed, aad) {
  const s = subtle();
  const raw = await s.decrypt({ name: "RSA-OAEP" }, privateKey, fromB64(sealed.key));
  const aesKey = await s.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await s.decrypt({ name: "AES-GCM", iv: fromB64(sealed.iv), additionalData: encode(aad) }, aesKey, fromB64(sealed.ct));
  return JSON.parse(new TextDecoder().decode(plain)).value;
}
