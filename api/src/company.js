// The workspace document and its tickets, in the shape the Aisty app reads.
import crypto from "node:crypto";
import { one, query } from "./db.js";
import { badRequest } from "./errors.js";

export const LIMITS = {
  companyName: 120, description: 4000, shortText: 120, location: 120, url: 300,
  goals: 100, goalTitle: 200, goalDescription: 2000, goalTarget: 200,
  tickets: 2000, ticketTitle: 200, ticketDescription: 10000, comment: 5000,
  kpis: 50, kpiName: 120, kpiHistory: 500,
  products: 100, productName: 200, productDescription: 2000, productPrice: 60,
  recurring: 50,
};

export const PRIORITIES = ["critical", "high", "medium", "low"];
const USER_STATUSES = ["open", "approved", "in_progress", "completed", "failed", "cancelled"];
const STATUS_ORDER = ["open", "approved", "awaiting_approval", "in_progress", "completed", "failed"];
const rank = (s) => Math.max(0, STATUS_ORDER.indexOf(s));

// Small validators

export function text(value, label, { max, required = false, multiline = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${label} is required.`);
    return "";
  }
  if (typeof value !== "string") throw badRequest(`${label} must be text.`);
  let v = multiline ? value.replace(/\r\n/g, "\n") : value.replace(/[\r\n]+/g, " ");
  // Control characters other than newline and tab have no business here.
  v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (required && !v) throw badRequest(`${label} is required.`);
  if (max && v.length > max) throw badRequest(`${label} must be ${max} characters or fewer.`);
  return v;
}

function list(value, label, max) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest(`${label} must be a list.`);
  if (value.length > max) throw badRequest(`At most ${max} ${label.toLowerCase()}.`);
  return value;
}

const clientId = (value) => (typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : crypto.randomUUID());

function date(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) throw badRequest(`${label} is not a valid date.`);
  return new Date(t).toISOString();
}

// Profile, goals, KPIs, products

export function normaliseProfile(body) {
  const out = {};
  if (body.name !== undefined) out.name = text(body.name, "Company name", { max: LIMITS.companyName, required: true });
  if (body.description !== undefined) out.description = text(body.description, "Description", { max: LIMITS.description, multiline: true });
  if (body.sector !== undefined) out.sector = text(body.sector, "Sector", { max: LIMITS.shortText });
  if (body.type !== undefined) out.type = text(body.type, "Type", { max: LIMITS.shortText });
  if (body.location !== undefined) out.location = text(body.location, "Location", { max: LIMITS.location });
  if (body.websiteUrl !== undefined) {
    const url = text(body.websiteUrl, "Website", { max: LIMITS.url });
    if (url && !/^https?:\/\/[^\s]+$/i.test(url) && !/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(url)) throw badRequest("Website must be a web address.");
    out.websiteUrl = url;
  }
  if (body.areasOfWork !== undefined) {
    out.areasOfWork = list(body.areasOfWork, "Areas of work", 30).map((a) => text(a, "Area of work", { max: LIMITS.shortText })).filter(Boolean);
  }
  if (body.usage !== undefined) {
    const usage = Array.isArray(body.usage) ? body.usage : [body.usage];
    out.usage = list(usage, "Usage", 30).map((a) => text(String(a ?? ""), "Usage", { max: LIMITS.shortText })).filter(Boolean);
  }
  return out;
}

export function normaliseGoals(value) {
  return list(value, "Goals", LIMITS.goals).map((g) => ({
    goalId: clientId(g?.goalId),
    title: text(g?.title, "Goal title", { max: LIMITS.goalTitle, required: true }),
    description: text(g?.description, "Goal description", { max: LIMITS.goalDescription, multiline: true }),
    target: text(g?.target, "Goal target", { max: LIMITS.goalTarget }),
  }));
}

export function normaliseKpis(value) {
  return list(value, "KPIs", LIMITS.kpis).map((k) => ({
    name: text(k?.name, "KPI name", { max: LIMITS.kpiName, required: true }),
    history: list(k?.history, "KPI history", LIMITS.kpiHistory).map((h) => {
      const v = Number(h?.value);
      if (!Number.isFinite(v)) throw badRequest("KPI values must be numbers.");
      return { value: v, date: date(h?.date, "KPI date") || new Date().toISOString() };
    }),
  }));
}

export function normaliseProducts(value) {
  return list(value, "Products", LIMITS.products).map((p) => ({
    productId: clientId(p?.productId),
    name: text(p?.name, "Product name", { max: LIMITS.productName, required: true }),
    description: text(p?.description, "Product description", { max: LIMITS.productDescription, multiline: true }),
    pricingModel: ["one_time", "monthly", "annual", "usage", "free"].includes(p?.pricingModel) ? p.pricingModel : "one_time",
    price: text(p?.price == null ? "" : String(p.price), "Price", { max: LIMITS.productPrice }),
    billingPeriod: text(p?.billingPeriod, "Billing period", { max: 40 }),
  }));
}

// Tickets

export function newTicket(fields) {
  return {
    ticketId: crypto.randomUUID(),
    title: "",
    description: "",
    status: "open",
    priority: "medium",
    dueDate: null,
    goalId: null,
    approved: false,
    recurringTemplateId: null,
    pendingApproval: null,
    responses: [],
    attachments: [],
    comments: [],
    execution: { status: "open" },
    createdAt: new Date().toISOString(),
    ...fields,
  };
}

// Merge a board save into stored tickets.
export function mergeTickets(incoming, existingById) {
  const now = new Date().toISOString();
  return list(incoming, "Tickets", LIMITS.tickets).map((raw) => {
    const t = raw || {};
    const existing = existingById.get(t.ticketId);
    const engineStatus = existing?.execution?.status || existing?.status || "open";
    let status = USER_STATUSES.includes(t.status) ? t.status : "open";
    if (existing && rank(engineStatus) > rank(status) && status !== "cancelled") status = existing.status;
    // Moving a ticket into "approved" is the approval itself.
    const approved = Boolean(existing?.approved) || status === "approved";
    const base = existing || newTicket({ ticketId: clientId(t.ticketId) });
    return {
      ...base,
      title: text(t.title, "Ticket title", { max: LIMITS.ticketTitle, required: true }),
      description: text(t.description, "Ticket description", { max: LIMITS.ticketDescription, multiline: true }),
      status,
      priority: PRIORITIES.includes(t.priority) ? t.priority : "medium",
      dueDate: date(t.dueDate, "Due date"),
      goalId: typeof t.goalId === "string" ? t.goalId.slice(0, 80) : null,
      approved,
      approvedAt: base.approvedAt || (approved ? now : undefined),
      aiGenerated: Boolean(t.aiGenerated || base.aiGenerated),
      aiOrigin: t.aiGenerated ? text(t.aiOrigin || "ai-agent", "AI origin", { max: 40 }) : base.aiOrigin || "",
    };
  });
}

export async function loadTickets(companyId, client = null) {
  const q = client ? client.query.bind(client) : query;
  const { rows } = await q("SELECT data FROM tickets WHERE company_id = $1 ORDER BY position, created_at", [companyId]);
  return rows.map((r) => r.data);
}

export async function getTicket(client, companyId, ticketId, { forUpdate = false } = {}) {
  const { rows } = await client.query(
    `SELECT data FROM tickets WHERE company_id = $1 AND ticket_id = $2 ${forUpdate ? "FOR UPDATE" : ""}`,
    [companyId, ticketId],
  );
  return rows[0]?.data || null;
}

export async function saveTicket(client, companyId, ticket, position = null) {
  await client.query(
    `INSERT INTO tickets (ticket_id, company_id, position, data) VALUES ($1, $2, COALESCE($3, (SELECT COALESCE(MAX(position),0)+1 FROM tickets WHERE company_id = $2)), $4)
     ON CONFLICT (ticket_id) DO UPDATE SET data = EXCLUDED.data, position = COALESCE($3, tickets.position), updated_at = now()
     WHERE tickets.company_id = $2`,
    [ticket.ticketId, companyId, position, ticket],
  );
}

/** Apply `fn(ticket)` to one stored ticket under a row lock. */
export async function updateTicket(client, companyId, ticketId, fn) {
  const ticket = await getTicket(client, companyId, ticketId, { forUpdate: true });
  if (!ticket) return null;
  const next = fn(structuredClone(ticket)) || ticket;
  await saveTicket(client, companyId, next);
  return next;
}

export async function lockCompany(client, companyId) {
  const { rows } = await client.query("SELECT id, owner_id, data FROM companies WHERE id = $1 FOR UPDATE", [companyId]);
  return rows[0] || null;
}

export async function saveCompanyData(client, companyId, data) {
  await client.query("UPDATE companies SET data = $2, updated_at = now() WHERE id = $1", [companyId, data]);
}

/** The full workspace as GET /company/me returns it. */
export async function companyView(companyId) {
  const company = await one("SELECT id, owner_id, data, created_at, updated_at FROM companies WHERE id = $1", [companyId]);
  if (!company) return null;
  const [tickets, integrations] = await Promise.all([
    loadTickets(companyId),
    query("SELECT provider, meta, created_at FROM integrations WHERE company_id = $1", [companyId]),
  ]);
  const d = company.data || {};
  return {
    _id: company.id,
    ownerId: company.owner_id,
    edition: "free",
    name: d.name || "",
    type: d.type || "",
    sector: d.sector || "",
    description: d.description || "",
    location: d.location || "",
    websiteUrl: d.websiteUrl || "",
    areasOfWork: d.areasOfWork || [],
    usage: d.usage || [],
    kpis: d.kpis || [],
    goals: d.goals || [],
    products: d.products || [],
    recurringTicketTemplates: d.recurringTicketTemplates || [],
    aiApprovalPolicy: d.aiApprovalPolicy || { level: "medium" },
    aiTaskLog: (d.aiTaskLog || []).slice(-200),
    insights: [],
    allowedIps: d.allowedIps || [],
    tickets,
    connectedServices: integrations.rows.map((r) => ({
      provider: r.provider,
      meta: { ...r.meta, connectedAt: r.created_at },
    })),
    createdAt: company.created_at,
    updatedAt: company.updated_at,
  };
}

/** Append to the AI task log that Home's activity card reads. */
export function appendTaskLog(data, entry) {
  const log = Array.isArray(data.aiTaskLog) ? data.aiTaskLog : [];
  const existing = log.findIndex((e) => e.taskId === entry.taskId);
  const row = { lastUpdated: new Date().toISOString(), ...entry };
  if (existing >= 0) log[existing] = { ...log[existing], ...row };
  else log.push({ startedAt: new Date().toISOString(), ...row });
  data.aiTaskLog = log.slice(-500);
  return data;
}
