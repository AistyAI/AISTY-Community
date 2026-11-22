// The Plan page: what this workspace has done with Aisty Free, the export that carries it into a hosted pilot, and opt-in usage counts.
import { query, one } from "../db.js";
import { audit, fromRequest, toApiRow, verifyChain } from "../audit.js";
import { signDocument, deploymentId } from "../crypto.js";
import { requireOwner, requireAdmin } from "../auth.js";
import { companyView } from "../company.js";
import { config } from "../config.js";

export async function usageSummary(companyId) {
  const [tickets, ai, members, integrations, approvals] = await Promise.all([
    query(`SELECT data->>'status' AS status, count(*)::int AS n FROM tickets WHERE company_id = $1 GROUP BY 1`, [companyId]),
    one(`SELECT count(*) FILTER (WHERE action = 'ai.tool.executed')::int AS actions,
                count(*) FILTER (WHERE action = 'ai.tool.executed' AND created_at > now() - interval '30 days')::int AS actions30
           FROM audit_log WHERE company_id = $1`, [companyId]),
    one(`SELECT count(*)::int AS n FROM team_members WHERE company_id = $1 AND status = 'active'`, [companyId]),
    query(`SELECT provider FROM integrations WHERE company_id = $1`, [companyId]),
    one(`SELECT count(*) FILTER (WHERE decided_by IS NOT NULL AND decided_by NOT LIKE 'policy:%' AND decided_by <> 'recurring approval')::int AS human FROM approvals WHERE company_id = $1`, [companyId]),
  ]);
  const byStatus = Object.fromEntries(tickets.rows.map((r) => [r.status, r.n]));
  const completed30 = await one(
    `SELECT count(*)::int AS n FROM tickets WHERE company_id = $1 AND data->>'status' = 'completed' AND updated_at > now() - interval '30 days'`,
    [companyId],
  );
  return {
    ticketsCompleted: byStatus.completed || 0,
    ticketsCompleted30d: completed30?.n || 0,
    ticketsByStatus: byStatus,
    aiActions: ai?.actions || 0,
    aiActions30d: ai?.actions30 || 0,
    approvalsDecided: approvals?.human || 0,
    members: members?.n || 0,
    integrations: integrations.rows.map((r) => r.provider),
  };
}

export default async function planRoutes(app) {
  const pre = { preHandler: app.workspace };

  app.get("/plan/usage", pre, async (req) => {
    const usage = await usageSummary(req.companyId);
    const telemetry = await one("SELECT value FROM app_settings WHERE key = 'telemetry'");
    return { edition: "free", usage, telemetry: { enabled: Boolean(telemetry?.value?.enabled), canEdit: req.workspaceRole === "owner" } };
  });

  app.put("/plan/telemetry", pre, async (req) => {
    requireOwner(req);
    const enabled = Boolean(req.body?.enabled);
    await query(
      `INSERT INTO app_settings (key, value) VALUES ('telemetry', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
      [{ enabled, changedAt: new Date().toISOString(), changedBy: req.user.email }],
    );
    await audit({ ...fromRequest(req), action: "telemetry.update", resource: "telemetry", metadata: { enabled } });
    return { enabled };
  });

  // A signed snapshot of the workspace for importing into a hosted Aisty pilot.
  app.get("/plan/export", pre, async (req, reply) => {
    requireOwner(req);
    const company = await companyView(req.companyId);
    const team = await query("SELECT email, role, status, activated_at FROM team_members WHERE company_id = $1 AND status = 'active'", [req.companyId]);
    const auditRows = (await query("SELECT * FROM audit_log ORDER BY seq ASC")).rows.map(toApiRow);
    const chain = verifyChain(auditRows);
    const body = {
      format: "aisty-free-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      deploymentId: await deploymentId(),
      company: { ...company, connectedServices: company.connectedServices.map((s) => ({ provider: s.provider })) },
      team: team.rows,
      audit: { rows: auditRows.filter((r) => r.companyId === req.companyId || !r.companyId), chainVerified: chain.ok },
    };
    const text = JSON.stringify(body);
    const signature = await signDocument(text);
    await audit({ ...fromRequest(req), action: "workspace.export", resource: "company", resourceId: req.companyId, metadata: { auditRows: auditRows.length } });
    reply.header("Content-Type", "application/json").header("Content-Disposition", `attachment; filename="aisty-free-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return { ...body, signature };
  });

  app.get("/plan/audit-verify", pre, async (req) => {
    requireAdmin(req);
    const rows = (await query("SELECT * FROM audit_log ORDER BY seq ASC")).rows.map(toApiRow);
    return { rows: rows.length, ...verifyChain(rows) };
  });
}

/** Weekly opt-in counts. Nothing about prompts, data, people or names. */
export async function sendTelemetry(log) {
  const setting = await one("SELECT value FROM app_settings WHERE key = 'telemetry'");
  if (!setting?.value?.enabled || !config.telemetryUrl) return;
  const company = await one("SELECT id FROM companies LIMIT 1");
  if (!company) return;
  const usage = await usageSummary(company.id);
  const payload = {
    deploymentId: await deploymentId(),
    edition: "free",
    version: process.env.npm_package_version || "0.1.0",
    members: usage.members,
    ticketsCompleted30d: usage.ticketsCompleted30d,
    aiActions30d: usage.aiActions30d,
    integrations: usage.integrations,
  };
  await fetch(config.telemetryUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) })
    .catch((err) => log.debug({ err: err.message }, "telemetry not sent"));
}

