// Audit Trail: the last 90 days, filtered, and a CSV export of them.
import { query } from "../db.js";
import { config } from "../config.js";
import { audit, fromRequest, toApiRow } from "../audit.js";
import { badRequest } from "../errors.js";
import { requireAdmin } from "../auth.js";

const VERB_PATTERNS = {
  created: "\\.(create|invite|upload|connect)$",
  updated: "\\.(update|edit|role_change|run_now)$",
  deleted: "\\.(delete|remove|disconnect|disable|cancel)$",
  exported: "\\.export$",
  executed: "\\.(execute|executed|run_now)$",
};

export const AI_ACTIONS = [
  "ai.tool.executed", "ai.approval.requested", "ai.approval.approved", "ai.approval.declined", "ai.approval.revised",
];

function parseDate(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t) : null;
}

/** The earliest moment Free shows: midnight UTC, `auditWindowDays` ago. */
export function windowStart(now = new Date()) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - config.auditWindowDays);
  return d;
}

function buildWhere(req) {
  const since = windowStart();
  const where = ["company_id = $1", "created_at >= $2"];
  const params = [req.companyId, since];
  const add = (sql, v) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  let from = parseDate(req.query.from);
  const clamped = Boolean(from && from < since);
  if (clamped) from = null;
  const to = parseDate(req.query.to);
  if (from) add("created_at >= ?", from);
  if (to) {
    // A bare date means "through the end of that day".
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setUTCHours(23, 59, 59, 999);
    add("created_at <= ?", to);
  }
  if (req.query.userId) add("user_id = ?", String(req.query.userId).slice(0, 200));

  const scope = String(req.query.scope || "").toLowerCase();
  if (scope === "aisty_link") {
    // The AI accountability feed.
    add("action = ANY(?)", AI_ACTIONS);
  } else if (req.query.verb && VERB_PATTERNS[String(req.query.verb).toLowerCase()]) {
    add("action ~ ?", VERB_PATTERNS[String(req.query.verb).toLowerCase()]);
  } else if (req.query.action) {
    add("action ILIKE ?", `%${String(req.query.action).slice(0, 100).replace(/[%_\\]/g, "\\$&")}%`);
  }
  return { sql: where.join(" AND "), params, since, clamped };
}

async function olderThanWindow(companyId, since) {
  const { rows } = await query("SELECT count(*)::int AS n FROM audit_log WHERE company_id = $1 AND created_at < $2", [companyId, since]);
  return rows[0].n;
}

const csv = (v) => {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

const COLUMNS = [
  ["Time (UTC)", (r) => r.createdAt],
  ["User", (r) => r.userEmail || r.userId],
  ["Role", (r) => r.workspaceRole],
  ["Action", (r) => r.action],
  ["Resource", (r) => r.resource],
  ["Resource ID", (r) => r.resourceId],
  ["Method", (r) => r.method],
  ["Path", (r) => r.path],
  ["IP", (r) => r.ip],
  ["Tool", (r) => r.metadata?.tool],
  ["Risk", (r) => r.metadata?.risk],
  ["Approved by", (r) => r.metadata?.approvedByEmail || r.metadata?.approvedBy],
  ["Outcome", (r) => r.metadata?.outcome],
  ["Details", (r) => r.metadata],
  ["Hash", (r) => r.hash],
  ["Previous hash", (r) => r.prevHash],
];

export default async function auditRoutes(app) {
  app.get("/audit", { preHandler: app.workspace }, async (req) => {
    requireAdmin(req);
    const { sql, params, since } = buildWhere(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const [rows, total, older] = await Promise.all([
      query(`SELECT * FROM audit_log WHERE ${sql} ORDER BY seq DESC LIMIT ${limit} OFFSET ${skip}`, params),
      query(`SELECT count(*)::int AS n FROM audit_log WHERE ${sql}`, params),
      olderThanWindow(req.companyId, since),
    ]);
    return {
      rows: rows.rows.map(toApiRow), total: total.rows[0].n, limit, skip,
      window: { days: config.auditWindowDays, since: since.toISOString(), olderEntries: older },
    };
  });

  app.get("/audit/export", { preHandler: app.workspace }, async (req, reply) => {
    requireAdmin(req);
    if (!parseDate(req.query.from) || !parseDate(req.query.to)) throw badRequest("`from` and `to` dates are required for export.");
    const { sql, params, since, clamped } = buildWhere(req);
    const { rows } = await query(`SELECT * FROM audit_log WHERE ${sql} ORDER BY seq ASC LIMIT 200000`, params);
    await audit({
      ...fromRequest(req), action: "audit.export", resource: "audit_log",
      metadata: { from: req.query.from, to: req.query.to, rows: rows.length, ...(clamped ? { limitedFrom: since.toISOString() } : {}) },
    });
    const lines = [COLUMNS.map(([h]) => csv(h)).join(",")];
    for (const raw of rows) {
      const r = toApiRow(raw);
      lines.push(COLUMNS.map(([, get]) => csv(get(r))).join(","));
    }
    const name = `audit-${String(req.query.from).slice(0, 10)}_to_${String(req.query.to).slice(0, 10)}.csv`.replace(/[^\w.-]/g, "");
    reply.header("Content-Type", "text/csv; charset=utf-8").header("Content-Disposition", `attachment; filename="${name}"`);
    // Tell the caller the range was cut to the window, so the UI can say so.
    if (clamped) reply.header("X-Aisty-Audit-Window-Start", since.toISOString());
    return `${lines.join("\n")}\n`;
  });
}
