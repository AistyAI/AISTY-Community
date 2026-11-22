// The work queue.
import { query } from "./db.js";
import { sealJson, openJson, uuid } from "./crypto.js";

const LEASE_SECONDS = 300;

export async function enqueue(client, { companyId, kind, ticketId = null, payload = {}, createdBy = null }) {
  const id = uuid();
  const q = client ? client.query.bind(client) : query;
  await q(
    `INSERT INTO jobs (id, company_id, kind, ticket_id, payload, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, companyId, kind, ticketId, sealJson(payload, `job:${id}`), createdBy],
  );
  return id;
}

/** An active (queued or running) job for a ticket, if any. */
export async function activeJobFor(client, companyId, ticketId) {
  const q = client ? client.query.bind(client) : query;
  const { rows } = await q(
    `SELECT id, kind, status FROM jobs WHERE company_id = $1 AND ticket_id = $2 AND status IN ('queued','running')
     ORDER BY created_at DESC LIMIT 1`,
    [companyId, ticketId],
  );
  return rows[0] || null;
}

export async function cancelJobsFor(client, companyId, ticketId) {
  const q = client ? client.query.bind(client) : query;
  await q(
    `UPDATE jobs SET status = 'cancelled', updated_at = now() WHERE company_id = $1 AND ticket_id = $2 AND status IN ('queued','running')`,
    [companyId, ticketId],
  );
}

export async function claim(limit) {
  const { rows } = await query(
    `UPDATE jobs SET status = 'running', attempts = attempts + 1, lease_until = now() + ($2 || ' seconds')::interval, updated_at = now()
     WHERE id IN (
       SELECT id FROM jobs
       WHERE (status = 'queued') OR (status = 'running' AND lease_until < now())
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     RETURNING id, company_id, kind, ticket_id, payload, attempts, created_by`,
    [limit, String(LEASE_SECONDS)],
  );
  return rows.map((r) => ({ ...r, payload: openJson(r.payload, `job:${r.id}`) || {} }));
}

export async function renew(id) {
  await query(`UPDATE jobs SET lease_until = now() + ($2 || ' seconds')::interval WHERE id = $1 AND status = 'running'`, [id, String(LEASE_SECONDS)]);
}

export async function isCancelled(id) {
  const { rows } = await query("SELECT status FROM jobs WHERE id = $1", [id]);
  return rows[0]?.status === "cancelled";
}

export async function finish(id, { result = null, error = null } = {}) {
  await query(
    `UPDATE jobs SET status = CASE WHEN status = 'cancelled' THEN 'cancelled' WHEN $3::text IS NULL THEN 'complete' ELSE 'failed' END,
       result = $2, error = $3, lease_until = NULL, updated_at = now() WHERE id = $1`,
    [id, result === null ? null : sealJson(result, `job-result:${id}`), error],
  );
}

export async function getJob(companyId, id) {
  const { rows } = await query("SELECT id, kind, status, result, error FROM jobs WHERE id = $1 AND company_id = $2", [id, companyId]);
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, kind: r.kind, status: r.status, error: r.error, result: r.result ? openJson(r.result, `job-result:${r.id}`) : null };
}
