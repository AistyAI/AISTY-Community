// Recurring tickets: a template spawns a fresh, approved ticket on a cron.
import crypto from "node:crypto";
import { CronExpressionParser } from "cron-parser";
import { tx, one } from "../db.js";
import { audit, fromRequest } from "../audit.js";
import { HttpError, badRequest, notFound } from "../errors.js";
import { requireEditor } from "../auth.js";
import { lockCompany, saveCompanyData, saveTicket, newTicket, text, LIMITS, PRIORITIES } from "../company.js";
import { enqueue } from "../jobs.js";

const MIN_INTERVAL_MS = 60 * 60 * 1000;

export function presetToCron(preset, hour = 9) {
  switch (String(preset || "").toLowerCase()) {
    case "daily": return `0 ${hour} * * *`;
    case "weekly": return `0 ${hour} * * 1`;
    case "monthly": return `0 ${hour} 1 * *`;
    case "quarterly": return `0 ${hour} 1 1,4,7,10 *`;
    case "yearly": return `0 ${hour} 1 1 *`;
    default: return null;
  }
}

export function nextRun(cron, timezone, from = new Date()) {
  return CronExpressionParser.parse(cron, { tz: timezone, currentDate: from }).next().toDate();
}

function validateSchedule(cron, timezone) {
  if (!cron || cron.length > 100 || cron.trim().split(/\s+/).length !== 5) throw badRequest("Use a five-field cron expression.");
  try { Intl.DateTimeFormat(undefined, { timeZone: timezone }); } catch { throw badRequest("Unknown timezone."); }
  let a; let b;
  try {
    const it = CronExpressionParser.parse(cron, { tz: timezone });
    a = it.next().toDate(); b = it.next().toDate();
  } catch { throw badRequest("That cron expression is not valid."); }
  if (b - a < MIN_INTERVAL_MS) throw badRequest("Recurring tasks can run at most once an hour.");
}

function templateFields(body, existing = {}) {
  const timezone = body.timezone !== undefined ? text(body.timezone, "Timezone", { max: 64 }) || "UTC" : existing.timezone || "UTC";
  let cron = body.cron !== undefined ? text(body.cron, "Cron", { max: 100 }) : undefined;
  if (cron === undefined && body.preset !== undefined) cron = presetToCron(body.preset);
  if (cron === undefined || cron === null) cron = existing.cron;
  if (!cron) throw badRequest("A cron expression or a preset (daily, weekly, monthly, quarterly, yearly) is required.");
  validateSchedule(cron, timezone);
  return {
    title: body.title !== undefined ? text(body.title, "Title", { max: LIMITS.ticketTitle, required: true }) : existing.title,
    description: body.description !== undefined ? text(body.description, "Description", { max: LIMITS.ticketDescription, multiline: true }) : existing.description || "",
    priority: PRIORITIES.includes(body.priority) ? body.priority : existing.priority || "medium",
    goalId: body.goalId !== undefined ? (typeof body.goalId === "string" ? body.goalId.slice(0, 80) : null) : existing.goalId ?? null,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : existing.enabled ?? true,
    cron,
    timezone,
    nextRunAt: nextRun(cron, timezone).toISOString(),
  };
}

/** Spawn one ticket from a template. Shared by run-now and the scheduler. */
export async function spawnFromTemplate(c, companyId, data, tpl, { by = null } = {}) {
  const ticket = newTicket({
    title: tpl.title,
    description: tpl.description,
    priority: tpl.priority,
    goalId: tpl.goalId,
    recurringTemplateId: tpl.templateId,
    approved: true,
    approvedAt: new Date().toISOString(),
    approvedBy: by || "recurring schedule",
    status: "in_progress",
    execution: { status: "in_progress", startedAt: new Date().toISOString() },
  });
  await saveTicket(c, companyId, ticket, null);
  tpl.lastRunAt = new Date().toISOString();
  tpl.lastSpawnedTicketId = ticket.ticketId;
  tpl.spawnCount = (tpl.spawnCount || 0) + 1;
  tpl.nextRunAt = nextRun(tpl.cron, tpl.timezone).toISOString();
  await saveCompanyData(c, companyId, data);
  await enqueue(c, { companyId, kind: "plan", ticketId: ticket.ticketId, payload: { recurringTemplateId: tpl.templateId } });
  return ticket;
}

export default async function recurringRoutes(app) {
  const pre = { preHandler: app.workspace };

  const withTemplate = async (req, fn) => tx(async (c) => {
    const company = await lockCompany(c, req.companyId);
    const data = company.data;
    const list = data.recurringTicketTemplates || [];
    const tpl = list.find((t) => t.templateId === req.params.templateId);
    if (!tpl) throw notFound("Template not found.");
    const result = await fn(c, data, tpl, list);
    return result;
  });

  app.get("/recurring-tickets", pre, async (req) => {
    const row = await one("SELECT data FROM companies WHERE id = $1", [req.companyId]);
    return { templates: row?.data?.recurringTicketTemplates || [] };
  });

  app.post("/recurring-tickets", pre, async (req, reply) => {
    requireEditor(req);
    const template = await tx(async (c) => {
      const company = await lockCompany(c, req.companyId);
      const data = company.data;
      const list = data.recurringTicketTemplates || [];
      if (list.length >= LIMITS.recurring) throw new HttpError(409, `A workspace can have at most ${LIMITS.recurring} recurring tickets.`);
      const tpl = {
        templateId: crypto.randomUUID(), ...templateFields(req.body || {}),
        lastRunAt: null, lastSpawnedTicketId: null, spawnCount: 0,
        approvedWorkflowFingerprint: null, workflowApprovedAt: null, workflowApprovedBy: null,
        createdAt: new Date().toISOString(), createdBy: req.user.email || req.user.userId,
      };
      data.recurringTicketTemplates = [...list, tpl];
      await saveCompanyData(c, req.companyId, data);
      await audit({ ...fromRequest(req), action: "recurring.create", resource: "recurring_ticket", resourceId: tpl.templateId, metadata: { title: tpl.title, cron: tpl.cron } }, c);
      return tpl;
    });
    reply.code(201);
    return { template };
  });

  app.patch("/recurring-tickets/:templateId", pre, async (req) => {
    requireEditor(req);
    const template = await withTemplate(req, async (c, data, tpl) => {
      Object.assign(tpl, templateFields(req.body || {}, tpl));
      await saveCompanyData(c, req.companyId, data);
      await audit({ ...fromRequest(req), action: "recurring.update", resource: "recurring_ticket", resourceId: tpl.templateId, metadata: { title: tpl.title, cron: tpl.cron, enabled: tpl.enabled } }, c);
      return tpl;
    });
    return { template };
  });

  app.post("/recurring-tickets/:templateId/disable", pre, async (req) => {
    requireEditor(req);
    const template = await withTemplate(req, async (c, data, tpl) => {
      tpl.enabled = false;
      await saveCompanyData(c, req.companyId, data);
      await audit({ ...fromRequest(req), action: "recurring.disable", resource: "recurring_ticket", resourceId: tpl.templateId, metadata: { title: tpl.title } }, c);
      return tpl;
    });
    return { template };
  });

  app.post("/recurring-tickets/:templateId/require-approval", pre, async (req) => {
    requireEditor(req);
    const template = await withTemplate(req, async (c, data, tpl) => {
      tpl.approvedWorkflowFingerprint = null;
      tpl.workflowApprovedAt = null;
      tpl.workflowApprovedBy = null;
      await saveCompanyData(c, req.companyId, data);
      await audit({ ...fromRequest(req), action: "recurring.require_approval", resource: "recurring_ticket", resourceId: tpl.templateId, metadata: { title: tpl.title } }, c);
      return tpl;
    });
    return { template };
  });

  app.delete("/recurring-tickets/:templateId", pre, async (req) => {
    requireEditor(req);
    await withTemplate(req, async (c, data, tpl, list) => {
      data.recurringTicketTemplates = list.filter((t) => t.templateId !== tpl.templateId);
      await saveCompanyData(c, req.companyId, data);
      await audit({ ...fromRequest(req), action: "recurring.delete", resource: "recurring_ticket", resourceId: tpl.templateId, metadata: { title: tpl.title } }, c);
    });
    return { message: "Recurring ticket deleted" };
  });

  app.post("/recurring-tickets/:templateId/run-now", pre, async (req, reply) => {
    requireEditor(req);
    const ticket = await withTemplate(req, async (c, data, tpl) => {
      if (tpl.lastRunAt && Date.now() - Date.parse(tpl.lastRunAt) < 60_000) {
        throw new HttpError(409, "This recurring ticket ran less than a minute ago.");
      }
      const t = await spawnFromTemplate(c, req.companyId, data, tpl, { by: req.user.email || req.user.userId });
      await audit({ ...fromRequest(req), action: "recurring.run_now", resource: "recurring_ticket", resourceId: tpl.templateId, metadata: { title: tpl.title, ticketId: t.ticketId } }, c);
      return t;
    });
    reply.code(201);
    return { ticket };
  });
}
