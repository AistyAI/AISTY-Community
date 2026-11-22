// Gmail for one Google Workspace mailbox, through a service account with domain-wide delegation.
import crypto from "node:crypto";
import { request, ProviderError, AI_DISCLOSURE } from "./http.js";

const SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";
const tokenCache = new Map();

function parseKey(json) {
  let key;
  try { key = typeof json === "string" ? JSON.parse(json) : json; } catch { throw new ProviderError("The service account key is not valid JSON."); }
  if (key?.type !== "service_account" || !key.client_email || !key.private_key) throw new ProviderError("Upload the JSON key of a Google service account.");
  return key;
}

async function accessToken(ctx) {
  const cacheKey = `${ctx.secrets.clientEmail}|${ctx.meta.email}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: ctx.secrets.clientEmail, scope: SCOPES, aud: "https://oauth2.googleapis.com/token", sub: ctx.meta.email, iat: now, exp: now + 3600,
  })}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), ctx.secrets.privateKey).toString("base64url");
  const data = await request("https://oauth2.googleapis.com/token", {
    method: "POST", form: true,
    body: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` },
  });
  tokenCache.set(cacheKey, { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 });
  return data.access_token;
}

const gmail = async (ctx, path, opts = {}) => request(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
  ...opts, headers: { Authorization: `Bearer ${await accessToken(ctx)}` },
});

const header = (msg, name) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

function bodyText(part) {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const p of part.parts || []) {
    const t = bodyText(p);
    if (t) return t;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  return "";
}

const safeHeader = (v) => String(v || "").replace(/[\r\n]+/g, " ").trim();

export default {
  key: "gmail",
  name: "Gmail",
  fields: { secret: ["serviceAccountKey"], plain: ["email"] },
  async connect({ serviceAccountKey, email }) {
    const key = parseKey(serviceAccountKey);
    const mailbox = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailbox)) throw new ProviderError("Enter the mailbox address the AI should act as.");
    const ctx = { secrets: { clientEmail: key.client_email, privateKey: key.private_key }, meta: { email: mailbox } };
    const profile = await gmail(ctx, "/profile").catch((err) => {
      throw new ProviderError(`Google refused access to ${mailbox}. Check domain-wide delegation for the gmail.readonly and gmail.send scopes. (${err.message})`);
    });
    return { meta: { email: profile.emailAddress || mailbox }, secrets: { clientEmail: key.client_email, privateKey: key.private_key } };
  },
  tools: [
    {
      name: "gmail_search", risk: "read",
      description: "Search the connected mailbox with Gmail search syntax, e.g. \"from:client@example.com newer_than:7d\".",
      parameters: { type: "object", properties: { q: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 25 } }, required: ["q"] },
      async run({ q, limit = 10 }, ctx) {
        const list = await gmail(ctx, `/messages?q=${encodeURIComponent(q)}&maxResults=${limit}`);
        const ids = (list.messages || []).map((m) => m.id);
        const msgs = await Promise.all(ids.map((id) => gmail(ctx, `/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`)));
        return msgs.map((m) => ({ id: m.id, threadId: m.threadId, from: header(m, "From"), subject: header(m, "Subject"), date: header(m, "Date"), snippet: m.snippet }));
      },
    },
    {
      name: "gmail_read_message", risk: "read",
      description: "Read one email in full.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      async run({ id }, ctx) {
        const m = await gmail(ctx, `/messages/${encodeURIComponent(id)}?format=full`);
        return { from: header(m, "From"), to: header(m, "To"), subject: header(m, "Subject"), date: header(m, "Date"), body: bodyText(m.payload).slice(0, 12000) };
      },
    },
    {
      name: "gmail_send", risk: "outbound",
      description: "Send an email from the connected mailbox. A line saying an AI wrote it is added automatically.",
      parameters: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, thread_id: { type: "string" } }, required: ["to", "subject", "body"] },
      async run({ to, subject, body, thread_id }, ctx) {
        const recipients = safeHeader(to);
        if (!recipients.split(",").every((r) => /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(r.replace(/^.*<|>.*$/g, "").trim()))) {
          throw new ProviderError("Each recipient must be an email address.");
        }
        const raw = [
          `From: ${ctx.meta.email}`, `To: ${recipients}`, `Subject: ${safeHeader(subject)}`,
          "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "",
          `${body}\n\n--\n${AI_DISCLOSURE}`,
        ].join("\r\n");
        const r = await gmail(ctx, "/messages/send", { method: "POST", body: { raw: Buffer.from(raw).toString("base64url"), ...(thread_id ? { threadId: thread_id } : {}) } });
        return { ok: true, id: r.id };
      },
    },
  ],
};
