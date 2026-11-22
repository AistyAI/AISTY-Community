// Workspace setup and the company document.
import { tx } from "../db.js";
import { uuid } from "../crypto.js";
import { audit, fromRequest } from "../audit.js";
import { config } from "../config.js";
import { HttpError, badRequest } from "../errors.js";
import { currentCompany, membershipFor, requireAdmin, requireEditor } from "../auth.js";
import { enqueue, activeJobFor, cancelJobsFor } from "../jobs.js";
import { normaliseAllowList, clearIpCache } from "../ipAccess.js";
import {
  companyView, normaliseProfile, normaliseGoals, normaliseKpis, normaliseProducts,
  mergeTickets, loadTickets, saveTicket, lockCompany, saveCompanyData, newTicket, text, LIMITS,
} from "../company.js";

export default async function workspaceRoutes(app) {
  // Where should a signed-in person go? The browser asks once after sign-in.
  app.get("/me/workspace", { preHandler: app.authenticate }, async (req) => {
    const company = await currentCompany();
    if (!company) return { status: "needs_onboarding", canCreate: canBootstrap(req.user) };
    const member = await membershipFor(company.id, req.user);
    if (!member) throw new HttpError(403, "You are not a member of this workspace. Ask its owner for an invite.");
    return { status: "member", role: member.role, companyName: company.data?.name || "" };
  });

  app.get("/onboarding/check-name", { preHandler: app.authenticate }, async () => {
    const company = await currentCompany();
    return company ? { available: false, reason: "This deployment already has a workspace." } : { available: true };
  });

  app.post("/onboarding/company", { preHandler: app.authenticate }, async (req, reply) => {
    if (!canBootstrap(req.user)) throw new HttpError(403, "This deployment is reserved for its configured owner.");
    const body = req.body || {};
    const profile = normaliseProfile({
      name: body.companyName ?? body.name,
      description: body.description,
      type: body.type,
      sector: body.sector,
      areasOfWork: Array.isArray(body.areasOfWork) ? body.areasOfWork.filter(Boolean) : undefined,
      usage: body.usage,
    });
    if (!profile.name) throw badRequest("Company name is required.");
    const goals = normaliseGoals((body.goals || []).filter((g) => g?.title?.trim()));
    const kpis = normaliseKpis((body.kpis || []).filter((k) => k?.name?.trim()));
    const tickets = (body.tickets || []).filter((t) => t?.title?.trim()).slice(0, 50);

    const created = await tx(async (c) => {
      // One workspace per deployment. The lock makes two first sign-ins race safely.
      await c.query("SELECT pg_advisory_xact_lock(727103)");
      const existing = await c.query("SELECT id FROM companies LIMIT 1");
      if (existing.rows.length) throw new HttpError(409, "This deployment already has a workspace.");
      const id = uuid();
      await c.query("INSERT INTO companies (id, owner_id, data) VALUES ($1, $2, $3)", [id, req.user.userId, {
        ...profile, goals, kpis, products: [], recurringTicketTemplates: [], aiApprovalPolicy: { level: "medium" }, aiTaskLog: [],
      }]);
      await c.query(
        `INSERT INTO team_members (id, company_id, user_id, email, role, status, activated_at) VALUES ($1,$2,$3,$4,'owner','active',now())`,
        [uuid(), id, req.user.userId, req.user.email || ""],
      );
      let pos = 0;
      for (const t of tickets) {
        await saveTicket(c, id, newTicket({
          title: text(t.title, "Ticket title", { max: LIMITS.ticketTitle, required: true }),
          description: text(t.description, "Ticket description", { max: LIMITS.ticketDescription, multiline: true }),
        }), pos++);
      }
      await audit({ ...fromRequest(req), companyId: id, workspaceRole: "owner", action: "workspace.create", resource: "company", resourceId: id, metadata: { name: profile.name } }, c);
      return id;
    });
    reply.code(201);
    return { companyId: created, workspaceSlug: null };
  });

  app.get("/company/me", { preHandler: app.workspace }, async (req) => {
    const company = await companyView(req.companyId);
    return { company, workspaceRole: req.workspaceRole };
  });

  app.put("/company/me", { preHandler: app.workspace }, async (req) => {
    const body = req.body || {};
    const touchesProfile = ["name", "description", "sector", "type", "location", "websiteUrl", "areasOfWork", "usage", "products", "kpis", "allowedIps"]
      .some((k) => body[k] !== undefined);
    const touchesBoard = body.goals !== undefined || body.tickets !== undefined;
    if (touchesProfile) requireAdmin(req);
    if (touchesBoard) requireEditor(req);

    const profile = normaliseProfile(body);
    const products = body.products !== undefined ? normaliseProducts(body.products) : undefined;
    const kpis = body.kpis !== undefined ? normaliseKpis(body.kpis) : undefined;
    const goals = body.goals !== undefined ? normaliseGoals(body.goals) : undefined;
    const allowedIps = body.allowedIps !== undefined ? normaliseAllowList(body.allowedIps, req.ip) : undefined;
    const hint = String(req.headers["x-audit-hint"] || "");

    await tx(async (c) => {
      const company = await lockCompany(c, req.companyId);
      const data = { ...company.data, ...profile };
      if (products) data.products = products;
      if (kpis) data.kpis = kpis;
      if (goals) data.goals = goals;
      if (allowedIps) data.allowedIps = allowedIps;
      await saveCompanyData(c, req.companyId, data);

      const changed = Object.keys(profile).concat(products ? ["products"] : [], kpis ? ["kpis"] : [], goals ? ["goals"] : [], allowedIps ? ["allowedIps"] : []);
      if (changed.length) {
        const action = allowedIps ? "ip_access.update" : /^product\.(create|update|delete)$/.test(hint) ? hint : "company.update";
        await audit({ ...fromRequest(req), action, resource: "company", resourceId: req.companyId, metadata: { fields: changed } }, c);
      }

      if (body.tickets !== undefined) await saveBoard(c, req, body.tickets);
    });
    if (allowedIps) clearIpCache();
    return { company: await companyView(req.companyId) };
  });

  // The address this server sees for the caller, for "Add my IP".
  app.get("/me/ip", { preHandler: app.authenticate }, async (req) => ({ ip: req.ip }));
}

function canBootstrap(user) {
  return !config.bootstrapOwnerEmail || (user.email || "").toLowerCase() === config.bootstrapOwnerEmail;
}

/** Persist a board save: create, update, reorder and delete tickets. */
async function saveBoard(c, req, incoming) {
  const existing = await loadTickets(req.companyId, c);
  const byId = new Map(existing.map((t) => [t.ticketId, t]));
  const merged = mergeTickets(incoming, byId);
  const keep = new Set(merged.map((t) => t.ticketId));

  for (const t of existing) {
    if (keep.has(t.ticketId)) continue;
    await cancelJobsFor(c, req.companyId, t.ticketId);
    await c.query("DELETE FROM tickets WHERE company_id = $1 AND ticket_id = $2", [req.companyId, t.ticketId]);
    await audit({ ...fromRequest(req), action: "ticket.delete", resource: "ticket", resourceId: t.ticketId, metadata: { title: t.title } }, c);
  }

  let pos = 0;
  for (const t of merged) {
    const before = byId.get(t.ticketId);
    const newlyApproved = t.approved && !before?.approved;
    if (newlyApproved) {
      // Dragging a ticket to Approved is the approval: queue the work.
      t.status = "in_progress";
      t.execution = { ...(t.execution || {}), status: "in_progress", startedAt: new Date().toISOString() };
      t.approvedBy = req.user.email || req.user.userId;
    }
    if (t.status === "cancelled" && before && before.status !== "cancelled") {
      await cancelJobsFor(c, req.companyId, t.ticketId);
      t.execution = { ...(t.execution || {}), status: "cancelled" };
      t.pendingApproval = null;
    }
    await saveTicket(c, req.companyId, t, pos++);

    if (!before) {
      await audit({ ...fromRequest(req), action: "ticket.create", resource: "ticket", resourceId: t.ticketId, metadata: { title: t.title, aiGenerated: Boolean(t.aiGenerated) } }, c);
    } else if (before.title !== t.title || before.description !== t.description || before.status !== t.status || before.priority !== t.priority || before.goalId !== t.goalId || before.dueDate !== t.dueDate) {
      await audit({ ...fromRequest(req), action: "ticket.update", resource: "ticket", resourceId: t.ticketId, metadata: { title: t.title, status: t.status } }, c);
    }
    if (newlyApproved) {
      await audit({ ...fromRequest(req), action: "ticket.approve", resource: "ticket", resourceId: t.ticketId, metadata: { title: t.title } }, c);
      if (!(await activeJobFor(c, req.companyId, t.ticketId))) {
        await enqueue(c, { companyId: req.companyId, kind: "plan", ticketId: t.ticketId, createdBy: req.user.userId });
      }
    }
  }
}

export { canBootstrap };
