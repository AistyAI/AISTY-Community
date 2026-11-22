// Sign-in and workspace membership.
import { config } from "./config.js";
import { one, query } from "./db.js";
import { sha256 } from "./crypto.js";
import { HttpError } from "./errors.js";

const EDITOR_ROLES = new Set(["owner", "admin", "member"]);
const ADMIN_ROLES = new Set(["owner", "admin"]);
const memoryCache = new Map(); // token hash → { userId, email, expiresAt }

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

async function fetchJson(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return { ok: false, status: res.status, body: null };
  return { ok: true, status: res.status, body: await res.json().catch(() => null) };
}

async function validateWithIdentityService(token) {
  let res;
  try {
    res = await fetchJson(`${config.identityUrl}/sessions/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_token: token }),
    });
  } catch {
    throw new HttpError(503, "The Aisty sign-in service could not be reached. Try again shortly.");
  }
  if (!res.ok || !res.body?.is_valid) return null;
  const claims = res.body.claims || {};
  const userId = claims.subject || claims.sub || res.body.user_id;
  if (!userId) return null;
  let email = claims.email?.address || (typeof claims.email === "string" ? claims.email : null);
  if (!email) {
    // Older tenants do not put the address in the claims; ask with the session.
    const emails = await fetchJson(`${config.identityUrl}/emails`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    const list = Array.isArray(emails?.body) ? emails.body : [];
    email = (list.find((e) => e.is_primary) || list[0])?.address || null;
  }
  const exp = claims.expiration ? Date.parse(claims.expiration) : NaN;
  return { userId, email: email ? email.toLowerCase() : null, sessionExpiresAt: Number.isFinite(exp) ? exp : null };
}

function devIdentity(token) {
  // Local development only (AISTY_DEV_AUTH=true, never in production).
  if (!config.devAuth || !token.startsWith("dev.")) return null;
  const email = Buffer.from(token.slice(4), "base64url").toString("utf8").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return { userId: `dev|${email}`, email, sessionExpiresAt: null };
}

export async function identify(token) {
  const hash = sha256(token);
  const now = Date.now();
  const cached = memoryCache.get(hash);
  if (cached && cached.expiresAt > now) return cached;

  const dbCached = await one(
    "SELECT user_id, email, expires_at FROM session_cache WHERE token_hash = $1 AND expires_at > now()",
    [hash],
  );
  if (dbCached) {
    const v = { userId: dbCached.user_id, email: dbCached.email, expiresAt: new Date(dbCached.expires_at).getTime() };
    memoryCache.set(hash, v);
    return v;
  }

  const who = devIdentity(token) || (token.startsWith("dev.") ? null : await validateWithIdentityService(token));
  if (!who) return null;
  const ttl = config.sessionCacheSeconds * 1000;
  const expiresAt = Math.min(now + ttl, who.sessionExpiresAt || Infinity);
  const v = { userId: who.userId, email: who.email, expiresAt };
  memoryCache.set(hash, v);
  await query(
    `INSERT INTO session_cache (token_hash, user_id, email, expires_at) VALUES ($1,$2,$3,to_timestamp($4/1000.0))
     ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [hash, v.userId, v.email, expiresAt],
  );
  if (memoryCache.size > 5000) memoryCache.clear();
  return v;
}

export async function currentCompany() {
  return one("SELECT id, owner_id, data, created_at, updated_at FROM companies ORDER BY created_at LIMIT 1");
}

export async function membershipFor(companyId, user) {
  const byUser = await one(
    "SELECT id, role, email FROM team_members WHERE company_id = $1 AND user_id = $2 AND status = 'active'",
    [companyId, user.userId],
  );
  return byUser || null;
}

/** Fastify hooks. `authenticate` proves who; `workspace` proves membership. */
export function registerAuth(app) {
  app.decorateRequest("user", null);
  app.decorateRequest("companyId", null);
  app.decorateRequest("workspaceRole", null);
  app.decorateRequest("memberId", null);
  app.decorateRequest("company", null);

  app.decorate("authenticate", async (req) => {
    const token = bearer(req);
    if (!token) throw new HttpError(401, "Sign in to continue.");
    const who = await identify(token);
    if (!who) throw new HttpError(401, "Your session has expired. Sign in again.");
    req.user = who;
  });

  app.decorate("workspace", async (req) => {
    await app.authenticate(req);
    const company = await currentCompany();
    if (!company) throw new HttpError(404, "This Aisty workspace has not been set up yet.");
    const member = await membershipFor(company.id, req.user);
    if (!member) throw new HttpError(403, "You are not a member of this workspace.");
    req.companyId = company.id;
    req.workspaceRole = member.role;
    req.memberId = member.id;
    req.company = company;
  });
}

export const requireEditor = (req) => {
  if (!EDITOR_ROLES.has(req.workspaceRole)) throw new HttpError(403, "Your role cannot change this.");
};
export const requireAdmin = (req) => {
  if (!ADMIN_ROLES.has(req.workspaceRole)) throw new HttpError(403, "Only owners and admins can do this.");
};
export const requireOwner = (req) => {
  if (req.workspaceRole !== "owner") throw new HttpError(403, "Only the workspace owner can do this.");
};
export const isEditor = (role) => EDITOR_ROLES.has(role);
