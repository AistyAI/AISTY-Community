// Running a ticket.
import crypto from "node:crypto";
import { tx, one } from "../db.js";
import { audit } from "../audit.js";
import { sealJson, openJson } from "../crypto.js";
import { config } from "../config.js";
import { companyView, updateTicket, lockCompany, saveCompanyData, appendTaskLog } from "../company.js";
import { enqueue, isCancelled, renew } from "../jobs.js";
import { chat, ModelError } from "./models.js";
import { toolsFor, validateArgs, RISK } from "./providers/index.js";
import { clip } from "./providers/http.js";
import { planRisk, shouldHold, fingerprint, loadModelConfig } from "./plans.js";

const GAP_MARKER = "[[needs-company-knowledge]]";

export class Cancelled extends Error {}

function companyContext(c) {
  const kpis = (c.kpis || []).map((k) => `${k.name}: ${k.history?.length ? k.history[k.history.length - 1].value : "no data"}`);
  return [
    `Company: ${c.name}${c.sector ? ` (${c.sector})` : ""}`,
    c.description && `About: ${c.description}`,
    c.areasOfWork?.length && `Areas of work: ${c.areasOfWork.join(", ")}`,
    c.goals?.length && `Goals:\n${c.goals.map((g) => `- ${g.title}${g.target ? ` (target: ${g.target})` : ""}`).join("\n")}`,
    kpis.length && `KPIs: ${kpis.join("; ")}`,
    c.products?.length && `Products: ${c.products.map((p) => p.name).join(", ")}`,
  ].filter(Boolean).join("\n");
}

function systemPrompt(company, tools, revisionNote) {
  const writes = tools.filter((t) => t.risk !== "read").map((t) => t.name);
  return `You are Aisty, an AI operator working on a task ("ticket") for the company below. A person approved this ticket and will read your result.

${companyContext(company)}

How to work:
- Use the read tools to gather what you need. Never invent facts, names, numbers or links; if a tool fails, say so.
- Calling a tool that changes something (${writes.length ? writes.join(", ") : "none connected"}) does NOT run it now. It is recorded as a proposed action with the exact arguments you give, and runs only after the workspace's approval rules are met. Give complete, final arguments. Its result will not be available to you.
- When finished, reply with the result for the person: what you found, what you propose to change and why, in plain language. Keep it concise and well structured.
- You cannot read the company's internal documents, policies or past work beyond what the connected tools return. If the task depends on such knowledge and you could not find it, say what was missing and put ${GAP_MARKER} on its own line at the end.
${revisionNote ? `\nThe reviewer asked for a revised plan: "${revisionNote}". Follow their instruction.` : ""}`;
}

async function guard(job) {
  if (await isCancelled(job.id)) throw new Cancelled();
  await renew(job.id);
}

async function setTicket(companyId, ticketId, fn) {
  return tx((c) => updateTicket(c, companyId, ticketId, fn));
}

async function logTask(companyId, entry) {
  await tx(async (c) => {
    const company = await lockCompany(c, companyId);
    await saveCompanyData(c, companyId, appendTaskLog(company.data, entry));
  });
}

async function policyLevel(companyId) {
  const row = await one("SELECT data FROM companies WHERE id = $1", [companyId]);
  return row?.data?.aiApprovalPolicy?.level || "medium";
}

function auditTool({ companyId, ticketId, tool, args, outcome, error, level, approvalMode, approval }) {
  return audit({
    companyId,
    userId: approvalMode === "human" ? approval?.decided_by || null : null,
    userEmail: approvalMode === "human" ? approval?.decided_by || null : null,
    action: "ai.tool.executed",
    resource: tool.provider,
    resourceId: ticketId,
    metadata: {
      tool: tool.name, risk: tool.riskLevel, level, outcome, ...(error ? { error: String(error).slice(0, 500) } : {}),
      approvalMode, approved: approvalMode !== "auto",
      ...(approval ? { approvalId: approval.approval_id, approvedByEmail: approval.decided_by } : {}),
      args: Object.fromEntries(Object.entries(args || {}).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 300) : v])),
    },
  });
}

async function finishTicket(companyId, ticketId, { status, text, error = "", knowledgeGap = false, runId }) {
  await setTicket(companyId, ticketId, (t) => {
    if (t.status === "cancelled") return t;
    t.status = status;
    t.pendingApproval = null;
    t.knowledgeGap = knowledgeGap;
    t.execution = { ...(t.execution || {}), status, runId, completedAt: new Date().toISOString(), error };
    if (text) t.responses = [...(t.responses || []), { text, source: "ai", createdAt: new Date().toISOString() }];
    return t;
  });
}

/** Phase 1: work the ticket and propose changes. */
export async function planTicket(job) {
  const { company_id: companyId, ticket_id: ticketId } = job;
  const company = await companyView(companyId);
  const ticket = company?.tickets.find((t) => t.ticketId === ticketId);
  if (!ticket || ticket.status === "cancelled") return;
  const runId = job.id;

  const model = await loadModelConfig(companyId);
  if (!model) {
    await finishTicket(companyId, ticketId, { status: "failed", runId, error: "No AI model is connected.", text: "No AI model is connected to this workspace yet. An owner or admin can connect one in Settings → Model, then approve this ticket again." });
    return;
  }

  const tools = await toolsFor(companyId);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const level = await policyLevel(companyId);
  await logTask(companyId, { taskId: runId, runId, title: ticket.title, stepType: "plan", status: "in_progress", metadata: { ticketId } });

  const messages = [{
    role: "user",
    content: `Ticket: ${ticket.title}\n\n${ticket.description || "(no description)"}${ticket.dueDate ? `\n\nDue: ${ticket.dueDate}` : ""}${(ticket.comments || []).length ? `\n\nComments from the team:\n${ticket.comments.slice(-10).map((c) => `- ${c.text}`).join("\n")}` : ""}`,
  }];
  const proposed = [];
  let finalText = "";

  for (let step = 0; step < config.agent.maxSteps; step++) {
    await guard(job);
    const reply = await chat(model, {
      system: systemPrompt(company, tools, job.payload?.revisionNote),
      messages,
      tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
      timeoutMs: config.agent.stepTimeoutMs,
    });
    messages.push(reply.assistant);
    if (!reply.toolCalls.length) { finalText = reply.text; break; }

    for (const call of reply.toolCalls) {
      const tool = byName.get(call.name);
      let content;
      if (!tool) {
        content = `There is no tool called ${call.name}.`;
      } else {
        const problem = validateArgs(tool, call.args);
        if (problem) content = `Not run: ${problem}`;
        else if (tool.risk !== "read") {
          proposed.push({ tool: tool.name, provider: tool.provider, providerName: tool.providerName, risk: tool.riskLevel, args: call.args, reason: reply.text?.slice(0, 300) || "" });
          content = `Recorded as proposed action #${proposed.length}. It has not run yet; it runs after approval.`;
        } else {
          try {
            content = clip(await tool.call(call.args));
            await auditTool({ companyId, ticketId, tool, args: call.args, outcome: "ok", level, approvalMode: "auto" });
          } catch (err) {
            content = `The tool failed: ${err.message}`;
            await auditTool({ companyId, ticketId, tool, args: call.args, outcome: "error", error: err.message, level, approvalMode: "auto" });
          }
        }
      }
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content });
    }
    if (step === config.agent.maxSteps - 1) finalText = reply.text || "I reached the step limit before finishing this ticket.";
  }

  const knowledgeGap = finalText.includes(GAP_MARKER);
  const draft = finalText.replace(GAP_MARKER, "").trim();

  if (!proposed.length && level !== "all") {
    await finishTicket(companyId, ticketId, { status: "completed", text: draft || "Done.", knowledgeGap, runId });
    await logTask(companyId, { taskId: runId, status: "completed", completedAt: new Date().toISOString(), resultSummary: draft.slice(0, 280) });
    return;
  }

  const risk = proposed.length ? planRisk(proposed) : "low";
  const plan = { actions: proposed, summary: draft, knowledgeGap };
  const approvalId = crypto.randomUUID();

  // A recurring ticket whose plan matches one a person already approved runs.
  const tplId = ticket.recurringTemplateId;
  const tpl = tplId ? (company.recurringTicketTemplates || []).find((t) => t.templateId === tplId) : null;
  const preApproved = tpl?.approvedWorkflowFingerprint && tpl.approvedWorkflowFingerprint === fingerprint(proposed);
  const hold = shouldHold(level, risk) && !preApproved;

  await tx(async (c) => {
    await c.query(
      "INSERT INTO approvals (approval_id, company_id, ticket_id, status, risk, plan, decided_at, decided_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [approvalId, companyId, ticketId, hold ? "pending" : "approved", risk, sealJson(plan, `approval:${approvalId}`),
        hold ? null : new Date(), hold ? null : preApproved ? "recurring approval" : `policy: ${level}`],
    );
    await updateTicket(c, companyId, ticketId, (t) => {
      if (t.status === "cancelled") return t;
      if (hold) {
        t.status = "awaiting_approval";
        t.pendingApproval = { approvalId, risk, stepCount: proposed.length, createdAt: new Date().toISOString() };
        t.execution = { ...(t.execution || {}), status: "awaiting_approval", runId };
      }
      return t;
    });
    await audit({
      companyId, action: hold ? "ai.approval.requested" : "ai.approval.approved", resource: "ticket", resourceId: ticketId,
      metadata: { approvalId, risk, level, approvalMode: hold ? "human" : preApproved ? "recurring" : "auto", steps: proposed.map((a) => ({ tool: a.tool, args: a.args })) },
    }, c);
    if (!hold) await enqueue(c, { companyId, kind: "execute", ticketId, payload: { approvalId } });
  });
  await logTask(companyId, { taskId: runId, status: hold ? "in_progress" : "completed", resultSummary: hold ? "Waiting for approval" : "Plan approved by policy" });
}

/** Phase 2: run exactly what was approved. */
export async function executeApproved(job) {
  const { company_id: companyId, ticket_id: ticketId } = job;
  const approval = await one("SELECT * FROM approvals WHERE approval_id = $1 AND company_id = $2", [job.payload.approvalId, companyId]);
  if (!approval || approval.status !== "approved") return;
  const plan = openJson(approval.plan, `approval:${approval.approval_id}`);
  const level = await policyLevel(companyId);
  const tools = new Map((await toolsFor(companyId)).map((t) => [t.name, t]));
  const runId = job.id;
  const approvalMode = /^policy:/.test(approval.decided_by || "") ? "auto" : approval.decided_by === "recurring approval" ? "recurring" : "human";
  await logTask(companyId, { taskId: runId, runId, title: plan.summary?.slice(0, 120) || "Approved plan", stepType: "execute", status: "in_progress", metadata: { ticketId } });

  const results = [];
  for (const action of plan.actions) {
    await guard(job);
    const tool = tools.get(action.tool);
    if (!tool) {
      results.push({ tool: action.tool, ok: false, error: "That integration was disconnected." });
      continue;
    }
    try {
      const out = await tool.call(action.args);
      results.push({ tool: action.tool, ok: true, result: out });
      await auditTool({ companyId, ticketId, tool, args: action.args, outcome: "ok", level, approvalMode, approval });
    } catch (err) {
      results.push({ tool: action.tool, ok: false, error: err.message });
      await auditTool({ companyId, ticketId, tool, args: action.args, outcome: "error", error: err.message, level, approvalMode, approval });
    }
  }

  // Pin a person's approval to the recurring template, so later runs with the same plan go ahead without asking.
  if (approvalMode === "human") {
    await tx(async (c) => {
      const company = await lockCompany(c, companyId);
      const ticket = (await c.query("SELECT data FROM tickets WHERE ticket_id = $1", [ticketId])).rows[0]?.data;
      const tpl = (company.data.recurringTicketTemplates || []).find((t) => t.templateId === ticket?.recurringTemplateId);
      if (!tpl) return;
      tpl.approvedWorkflowFingerprint = fingerprint(plan.actions);
      tpl.workflowApprovedAt = new Date().toISOString();
      tpl.workflowApprovedBy = approval.decided_by;
      await saveCompanyData(c, companyId, company.data);
    });
  }

  const failed = results.filter((r) => !r.ok);
  let text = plan.summary || "";
  const model = await loadModelConfig(companyId);
  if (model) {
    try {
      const reply = await chat(model, {
        system: "You are Aisty. Write the final report for a ticket a person approved: what was done, with any links or IDs from the results, and anything that failed. Be concise. Do not invent results.",
        messages: [{ role: "user", content: `Plan summary:\n${plan.summary}\n\nResults of the approved actions:\n${clip(results, 12000)}` }],
        timeoutMs: config.agent.stepTimeoutMs,
      });
      if (reply.text) text = reply.text;
    } catch { /* keep the plan summary plus the raw outcome below */ }
  }
  if (!model || !text) {
    text = `${plan.summary}\n\n${results.map((r) => `- ${r.tool}: ${r.ok ? "done" : `failed (${r.error})`}`).join("\n")}`;
  }
  const status = failed.length === results.length ? "failed" : "completed";
  await finishTicket(companyId, ticketId, {
    status, text, runId, knowledgeGap: Boolean(plan.knowledgeGap),
    error: failed.length ? `${failed.length} of ${results.length} actions failed.` : "",
  });
  await logTask(companyId, { taskId: runId, status: status === "failed" ? "failed" : "completed", completedAt: new Date().toISOString(), resultSummary: text.slice(0, 280) });
}

export async function failTicket(job, err) {
  if (!job.ticket_id) return;
  const message = err instanceof ModelError ? err.message : `The AI could not finish this ticket: ${err.message}`;
  await finishTicket(job.company_id, job.ticket_id, { status: "failed", runId: job.id, error: message.slice(0, 500), text: message });
  await logTask(job.company_id, { taskId: job.id, status: "failed", completedAt: new Date().toISOString(), resultSummary: message.slice(0, 280) }).catch(() => {});
}

export { RISK };
