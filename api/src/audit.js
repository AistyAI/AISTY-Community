// The audit log: who did what, and what the AI did on whose authority.
import { pool } from "./db.js";
import { sealJson, openJson, sha256, uuid } from "./crypto.js";

const GENESIS = "0".repeat(64);

function canonical(row) {
  return JSON.stringify([
    row.id, row.company_id, row.user_id, row.user_email, row.workspace_role, row.method, row.action,
    row.resource, row.resource_id, row.path, row.status_code, row.created_at, row.metadata_digest,
  ]);
}

// Record an event.
export async function audit(entry, client = null) {
  const conn = client || (await pool.connect());
  const own = !client;
  try {
    if (own) await conn.query("BEGIN");
    await conn.query("SELECT pg_advisory_xact_lock(727102)");
    const prev = await conn.query("SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1");
    const id = uuid();
    const createdAt = new Date().toISOString();
    const metadata = entry.metadata || {};
    const row = {
      id,
      company_id: entry.companyId || null,
      user_id: entry.userId || null,
      user_email: entry.userEmail || null,
      workspace_role: entry.workspaceRole || null,
      method: entry.method || null,
      action: entry.action,
      resource: entry.resource || null,
      resource_id: entry.resourceId != null ? String(entry.resourceId) : null,
      path: entry.path || null,
      status_code: entry.statusCode ?? null,
      created_at: createdAt,
      metadata_digest: sha256(JSON.stringify(metadata)),
    };
    const prevHash = prev.rows[0]?.hash || GENESIS;
    const hash = sha256(prevHash + canonical(row));
    await conn.query(
      `INSERT INTO audit_log (id, company_id, user_id, user_email, workspace_role, method, action, resource,
         resource_id, path, status_code, ip, user_agent, metadata, created_at, prev_hash, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [id, row.company_id, row.user_id, row.user_email, row.workspace_role, row.method, row.action, row.resource,
        row.resource_id, row.path, row.status_code, entry.ip || null, entry.userAgent || null,
        sealJson(metadata, `audit:${id}`), createdAt, prevHash, hash],
    );
    if (own) await conn.query("COMMIT");
    return id;
  } catch (err) {
    if (own) await conn.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    if (own) conn.release();
  }
}

/** Audit fields taken from the request that caused the event. */
export function fromRequest(req, extra = {}) {
  return {
    companyId: req.companyId,
    userId: req.user?.userId,
    userEmail: req.user?.email,
    workspaceRole: req.workspaceRole,
    method: req.method,
    path: req.routeOptions?.url || req.url?.split("?")[0],
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    ...extra,
  };
}

export function toApiRow(r) {
  let metadata = {};
  try { metadata = openJson(r.metadata, `audit:${r.id}`) || {}; } catch { metadata = { unreadable: true }; }
  return {
    _id: r.id,
    seq: Number(r.seq),
    companyId: r.company_id,
    userId: r.user_id,
    userEmail: r.user_email,
    workspaceRole: r.workspace_role,
    method: r.method,
    action: r.action,
    resource: r.resource,
    resourceId: r.resource_id,
    path: r.path,
    statusCode: r.status_code,
    ip: r.ip,
    userAgent: r.user_agent,
    metadata,
    createdAt: new Date(r.created_at).toISOString(),
    prevHash: r.prev_hash,
    hash: r.hash,
  };
}

/** Recompute the chain over a set of rows in sequence order. */
export function verifyChain(rows) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const expected = sha256(r.prevHash + canonical({
      id: r._id, company_id: r.companyId, user_id: r.userId, user_email: r.userEmail,
      workspace_role: r.workspaceRole, method: r.method, action: r.action, resource: r.resource,
      resource_id: r.resourceId, path: r.path, status_code: r.statusCode, created_at: r.createdAt,
      metadata_digest: sha256(JSON.stringify(r.metadata || {})),
    }));
    if (expected !== r.hash) return { ok: false, brokenAt: r._id };
    if (i > 0 && rows[i - 1].hash !== r.prevHash) return { ok: false, brokenAt: r._id };
  }
  return { ok: true };
}
