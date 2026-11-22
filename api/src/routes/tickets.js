// Ticket actions: approve, comment, run, cancel, suggest; and the plan approval gate.
import crypto from "node:crypto";
import { tx, one } from "../db.js";
import { audit, fromRequest } from "../audit.js";
import { HttpError, badRequest, notFound } from "../errors.js";
import { requireEditor } from "../auth.js";
import { enqueue, activeJobFor, cancelJobsFor, getJob } from "../jobs.js";
import { getTicket, updateTicket, saveTicket, newTicket, text, LIMITS } from "../company.js";
import { openJson } from "../crypto.js";
import { approvalCard } from "../agent/plans.js";

const startExecution = (t, req) => {
  t.approved = true;
  t.approvedAt = t.approvedAt || new Date().toISOString();
  t.approvedBy = t.approvedBy || req.user.email || req.user.userId;
  t.status = "in_progress";
  t.pendingApproval = null;
  t.execution = { ...(t.execution || {}), status: "in_progress", startedAt: new Date().toISOString(), error: "" };
  return t;
};

/** Queue planning for a ticket unless it already has work in flight. */
async function queueTicket(c, req, ticketId) {
  const active = await activeJobFor(c, req.companyId, ticketId);
  if (active) return active.id;
  return enqueue(c, { companyId: req.companyId, kind: "plan", ticketId, createdBy: req.user.userId });
}

export default async function ticketRoutes(app) {
  const pre = { preHandler: app.workspace };

  app.post("/tickets/:ticketId/approve", pre, async (req) => {
    requireEditor(req);
    const runId = await tx(async (c) => {
      const t = await updateTicket(c, req.companyId, req.params.ticketId, (t) => {
        if (["completed", "cancelled"].includes(t.status)) throw new HttpError(409, "This ticket is already closed.");
        return startExecution(t, req);
      });
      if (!t) throw notFound("Ticket not found.");
      await audit({ ...fromRequest(req), action: "ticket.approve", resource: "ticket", resourceId: t.ticketId, metadata: { title: t.title } }, c);
      return queueTicket(c, req, t.ticketId);
    });
    return { message: "Ticket approved.", runId };
  });

  // The hosted app calls this right after approving.
  app.post("/tickets/submit", pre, async (req) => {
    requireEditor(req);
    const ticketId = req.body?.ticket?.ticketId;
    if (!ticketId) throw badRequest("ticket.ticketId is required.");
    const runId = await tx(async (c) => {
      let t = await getTicket(c, req.companyId, ticketId);
      if (!t) {
        // "Run as task" from chat: the person asking is the person approving.
        t = startExecution(newTicket({
          ticketId: String(ticketId).slice(0, 80),
          title: text(req.body.ticket.title, "Title", { max: LIMITS.ticketTitle, required: true }),
          description: text(req.body.ticket.description, "Description", { max: LIMITS.ticketDescription, multiline: true }),
          aiOrigin: "chat",
        }), req);
        await saveTicket(c, req.companyId, t, null);
        await audit({ ...fromRequest(req), action: "ticket.create", resource: "ticket", resourceId: t.ticketId, metadata: { title: t.title, source: "chat" } }, c);
        await audit({ ...fromRequest(req), action: "ticket.approve", resource: "ticket", resourceId: t.ticketId, metadata: { title: t.title } }, c);
      }
      if (!t.approved) throw new HttpError(409, "Approve the ticket before running it.");
      if (["completed", "cancelled"].includes(t.status)) throw new HttpError(409, "This ticket is already closed.");
      return queueTicket(c, req, ticketId);
    });
    return { status: "queued", runId };
  });

  app.post("/tickets/:ticketId/cancel", pre, async (req) => {
    requireEditor(req);
    await tx(async (c) => {
      await cancelJobsFor(c, req.companyId, req.params.ticketId);
      await c.query(
        "UPDATE approvals SET status = 'expired', decided_at = now() WHERE company_id = $1 AND ticket_id = $2 AND status = 'pending'",
        [req.companyId, req.params.ticketId],
      );
      const t = await updateTicket(c, req.companyId, req.params.ticketId, (t) => {
        if (["completed"].includes(t.status)) return t;
        t.status = "cancelled";
        t.pendingApproval = null;
        t.execution = { ...(t.execution || {}), status: "cancelled", completedAt: new Date().toISOString() };
        return t;
      });
      if (t) await audit({ ...fromRequest(req), action: "ticket.cancel", resource: "ticket", resourceId: t.ticketId, metadata: { title: t.title } }, c);
    });
    return { status: "cancelled" };
  });

  app.get("/tickets/:ticketId/comments", pre, async (req) => {
    const row = await one("SELECT data FROM tickets WHERE company_id = $1 AND ticket_id = $2", [req.companyId, req.params.ticketId]);
    if (!row) throw notFound("Ticket not found.");
    return { comments: row.data.comments || [] };
  });

  app.post("/tickets/:ticketId/comments", pre, async (req, reply) => {
    requireEditor(req);
    const body = text(req.body?.text, "Comment", { max: LIMITS.comment, required: true, multiline: true });
    const comment = { commentId: crypto.randomUUID(), text: body, userId: req.user.userId, userEmail: req.user.email, createdAt: new Date().toISOString() };
    await tx(async (c) => {
      const t = await updateTicket(c, req.companyId, req.params.ticketId, (t) => {
        t.comments = [...(t.comments || []), comment].slice(-500);
        return t;
      });
      if (!t) throw notFound("Ticket not found.");
      await audit({ ...fromRequest(req), action: "ticket.comment.create", resource: "ticket", resourceId: t.ticketId }, c);
    });
    reply.code(201);
    return { comment };
  });

  app.post("/tickets/suggest", pre, async (req) => {
    requireEditor(req);
    const jobId = await enqueue(null, { companyId: req.companyId, kind: "suggest", createdBy: req.user.userId });
    await audit({ ...fromRequest(req), action: "ticket.suggest", resource: "ticket" });
    return { jobId, status: "processing" };
  });

  app.get("/jobs/:jobId", pre, async (req) => {
    const job = await getJob(req.companyId, req.params.jobId);
    if (!job) throw notFound("Job not found.");
    if (job.status === "complete") return { status: "complete", data: job.result };
    if (job.status === "failed" || job.status === "cancelled") return { status: "failed", error: job.error || "The AI could not finish this." };
    return { status: "processing" };
  });

  /* Plan approval gate */

  app.get("/tickets/:ticketId/approvals/:approvalId", pre, async (req) => {
    const a = await one(
      "SELECT * FROM approvals WHERE approval_id = $1 AND company_id = $2 AND ticket_id = $3",
      [req.params.approvalId, req.companyId, req.params.ticketId],
    );
    if (!a) throw notFound("Approval not found.");
    const t = await one("SELECT data FROM tickets WHERE company_id = $1 AND ticket_id = $2", [req.companyId, req.params.ticketId]);
    return { approval: approvalCard(a, openJson(a.plan, `approval:${a.approval_id}`), t?.data) };
  });

  app.post("/tickets/:ticketId/approvals/:approvalId", pre, async (req) => {
    requireEditor(req);
    const decision = String(req.body?.decision || "");
    if (!["approve", "decline", "revise"].includes(decision)) throw badRequest("decision must be approve, decline or revise.");
    const note = text(req.body?.note, "Note", { max: 2000, multiline: true });
    if (decision === "revise" && !note) throw badRequest("Say what should change.");

    return tx(async (c) => {
      const { rows } = await c.query(
        "SELECT * FROM approvals WHERE approval_id = $1 AND company_id = $2 AND ticket_id = $3 FOR UPDATE",
        [req.params.approvalId, req.companyId, req.params.ticketId],
      );
      const a = rows[0];
      if (!a) throw notFound("Approval not found.");
      if (a.status !== "pending") throw new HttpError(409, "That plan was already decided.");
      const status = decision === "approve" ? "approved" : decision === "decline" ? "declined" : "revised";
      await c.query(
        "UPDATE approvals SET status = $2, decided_at = now(), decided_by = $3, note = $4 WHERE approval_id = $1",
        [a.approval_id, status, req.user.email || req.user.userId, note || null],
      );
      const plan = openJson(a.plan, `approval:${a.approval_id}`);
      const meta = {
        approvalId: a.approval_id, risk: a.risk, note: note || undefined,
        approvedBy: req.user.userId, approvedByEmail: req.user.email,
        steps: (plan.actions || []).map((s) => ({ tool: s.tool, args: s.args })),
      };

      if (decision === "approve") {
        await updateTicket(c, req.companyId, a.ticket_id, (t) => {
          t.status = "in_progress";
          t.pendingApproval = null;
          t.execution = { ...(t.execution || {}), status: "in_progress" };
          return t;
        });
        const runId = await enqueue(c, { companyId: req.companyId, kind: "execute", ticketId: a.ticket_id, payload: { approvalId: a.approval_id }, createdBy: req.user.userId });
        await audit({ ...fromRequest(req), action: "ai.approval.approved", resource: "ticket", resourceId: a.ticket_id, metadata: meta }, c);
        return { status: "approved", runId };
      }
      if (decision === "decline") {
        await updateTicket(c, req.companyId, a.ticket_id, (t) => {
          t.status = "cancelled";
          t.pendingApproval = null;
          t.execution = { ...(t.execution || {}), status: "cancelled", completedAt: new Date().toISOString() };
          return t;
        });
        await audit({ ...fromRequest(req), action: "ai.approval.declined", resource: "ticket", resourceId: a.ticket_id, metadata: meta }, c);
        return { status: "declined" };
      }
      // Revise: re-plan with the reviewer's note. The new plan arrives as a new approval.
      const jobId = await enqueue(c, { companyId: req.companyId, kind: "plan", ticketId: a.ticket_id, payload: { revisionNote: note, previousApprovalId: a.approval_id }, createdBy: req.user.userId });
      await updateTicket(c, req.companyId, a.ticket_id, (t) => {
        t.status = "in_progress";
        t.pendingApproval = null;
        t.execution = { ...(t.execution || {}), status: "in_progress" };
        return t;
      });
      await audit({ ...fromRequest(req), action: "ai.approval.revised", resource: "ticket", resourceId: a.ticket_id, metadata: meta }, c);
      return { status: "revised", approvalId: null, jobId };
    });
  });
}
