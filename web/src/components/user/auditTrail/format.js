export { API_URL } from "../../../config";
export const PROJECT = "Aisty";
export const PAGE_SIZE = 100;

export function formatDay(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch (_) {
    return iso;
  }
}

export function formatWhen(iso) {
  if (!iso) return "–";
  try {
    return new Date(iso).toLocaleString();
  } catch (_) {
    return iso;
  }
}

// Map an audit row to a human-readable phrase describing what the user did.
export const FIELD_LABELS = {
  name: "company name",
  description: "description",
  type: "company type",
  sector: "sector",
  websiteUrl: "website URL",
  location: "location",
  areasOfWork: "areas of work",
  usage: "usage list",
  products: "products",
  goals: "goals",
  kpis: "KPIs",
  allowedIps: "allowed IP list",
  subscriptionStatus: "subscription status",
  title: "title",
  priority: "priority",
  status: "status",
  dueDate: "due date",
  goalId: "linked goal",
  cron: "schedule",
  preset: "schedule preset",
  timezone: "timezone",
  enabled: "active state",
  role: "role",
  vote: "feedback vote",
};

/** Which surface the agent was acting on, for the compliance feed's Source column. */
export function agentSource(meta) {
  if (meta.kind === "ticket_workflow") return "Aisty · task";
  if (meta.kind === "chat_tool") return "Aisty · chat";
  return "Aisty";
}

export function describeAction(row) {
  const action = row.action || "";
  const resource = row.resource || "";
  const resourceId = row.resourceId ? truncate(row.resourceId, 32) : "";
  const fields = (row.metadata && Array.isArray(row.metadata.fields)) ? row.metadata.fields : [];

  const meta = row.metadata || {};
  const rules = [
    // Aisty Link policy violations (from the desktop monitor)
    {
      match: /^policy\.violation$/,
      text: `Aisty Link ${meta.mode === "enforce" ? "blocked" : "flagged"} ${resource || "an AI tool"}` +
        (meta.url ? ` (${truncate(meta.url, 48)})` : meta.process ? ` (${meta.process})` : "") +
        (meta.severity ? `, ${meta.severity}` : ""),
    },

    // Every tool the agent ran.
    {
      match: /^ai\.tool\.executed$/,
      text: `Aisty ${meta.outcome === "error" ? "tried to " : ""}${resource || "ran a tool"}` +
        (meta.outcome === "error" ? ", which failed" : "") +
        // Say the unattended case out loud.
        ({
          human: " (a person approved it first)",
          preapproved: " (on a previously approved plan)",
          auto: " (auto-approved, nobody was asked)",
        }[meta.approvalMode] || (meta.approved ? " (approved first)" : "")),
    },

    // AI action approvals: who let the AI do what, and when.
    {
      match: /^ai\.approval\.requested$/,
      text: `Aisty asked for approval to ${resource || "run an action"}` +
        (meta.risk ? `, ${meta.risk} risk` : ""),
    },
    {
      match: /^ai\.approval\.approved$/,
      text: `Approved: Aisty ${resource || "ran an action"}` +
        (meta.risk ? `, ${meta.risk} risk` : ""),
    },
    {
      match: /^ai\.approval\.declined$/,
      text: `Declined: Aisty did not ${resource || "run an action"}`,
    },
    {
      match: /^ai\.approval\.revised$/,
      text: `Sent back for changes: ${resource || "an AI action"}`,
    },
    {
      match: /^ai\.approval\.policy_change$/,
      text: `Changed the AI approval policy${meta.level ? ` to "${meta.level}"` : ""}`,
    },

    // Integrations
    { match: /^integration\.connect$/, text: `Connected ${capitalize(resource) || "an integration"}` },
    { match: /^integration\.disconnect$/, text: `Disconnected ${capitalize(resource) || "an integration"}` },

    // KPIs
    { match: /^kpi\.create$/, text: "Created a KPI" },
    { match: /^kpi\.update$/, text: resourceId ? `Updated KPI '${resourceId}'` : "Updated a KPI" },
    { match: /^kpi\.delete$/, text: resourceId ? `Deleted KPI '${resourceId}'` : "Deleted a KPI" },

    // Team
    { match: /^team\.invite$/, text: "Invited a team member" },
    { match: /^team\.role_change$/, text: "Changed a team member's role" },
    { match: /^team\.remove$/, text: "Removed a team member" },

    // Tickets
    { match: /^ticket\.create$/, text: "Created a ticket" },
    { match: /^ticket\.update$/, text: resourceId ? `Updated ticket ${shortId(resourceId)}` : "Updated a ticket" },
    { match: /^ticket\.delete$/, text: resourceId ? `Deleted ticket ${shortId(resourceId)}` : "Deleted a ticket" },
    { match: /^ticket\.execute$/, text: resourceId ? `Ran ticket ${shortId(resourceId)}` : "Ran a ticket" },
    { match: /^ticket\.cancel$/, text: resourceId ? `Cancelled ticket ${shortId(resourceId)}` : "Cancelled a ticket" },

    // Recurring tasks
    { match: /^recurring\.create$/, text: "Created a recurring task" },
    { match: /^recurring\.update$/, text: "Edited a recurring task" },
    { match: /^recurring\.disable$/, text: "Paused a recurring task" },
    { match: /^recurring\.run_now$/, text: "Manually triggered a recurring task" },
    { match: /^recurring\.delete$/, text: "Deleted a recurring task" },

    // Company
    { match: /^company\.create$/, text: "Created the workspace" },
    // Specialised company.update.* hints (sent from forms that know which field they're targeting).
    { match: /^company\.update\.name$/, text: "Updated the company name" },
    { match: /^company\.update\.description$/, text: "Updated the company description" },
    { match: /^company\.update\.sector$/, text: "Updated the company sector" },
    { match: /^company\.update\.industry$/, text: "Updated the company industry" },
    { match: /^company\.update\.areas_of_work$/, text: "Updated the company's areas of work" },
    { match: /^company\.update\.website$/, text: "Updated the company website" },
    { match: /^company\.update\.location$/, text: "Updated the company location" },
    { match: /^company\.update\.usage$/, text: "Updated the company usage list" },
    { match: /^company\.update\.allowed_ips$/, text: "Updated the allowed IP list" },
    { match: /^company\.update\.goals$/, text: "Updated company goals" },
    {
      match: /^company\.update$/,
      text: fields.length
        ? `Updated ${formatFieldList(fields)}`
        : "Updated company information",
    },

    // Products (hints sent from Settings → Products UI)
    { match: /^product\.create$/, text: "Added a product" },
    { match: /^product\.update$/, text: "Edited a product" },
    { match: /^product\.delete$/, text: "Deleted a product" },

    // Goals (hints sent from Goals & Tickets UI)
    { match: /^goal\.create$/, text: "Added a goal" },
    { match: /^goal\.update$/, text: "Edited a goal" },
    { match: /^goal\.delete$/, text: "Deleted a goal" },

    // Files
    { match: /^file\.upload$/, text: "Uploaded a file" },
    { match: /^file\.delete$/, text: "Deleted a file" },

    // Audit
    { match: /^audit\.export$/, text: "Exported the audit trail" },
  ];

  for (const rule of rules) {
    if (rule.match.test(action)) return rule.text;
  }
  // Fallback: turn "kpi.something_else" into "Kpi: something else"
  if (action.includes(".")) {
    const [domain, ...rest] = action.split(".");
    const verb = rest.join(".").replace(/_/g, " ");
    return `${capitalize(domain)}: ${verb}`;
  }
  return action || "(unrecognised action)";
}

export function formatFieldList(fields) {
  const labels = fields.map((f) => FIELD_LABELS[f] || f).filter(Boolean);
  if (labels.length === 0) return "company information";
  if (labels.length === 1) return `the ${labels[0]}`;
  if (labels.length === 2) return `the ${labels[0]} and ${labels[1]}`;
  const head = labels.slice(0, -1).join(", ");
  return `the ${head}, and ${labels[labels.length - 1]}`;
}

export function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function shortId(s) {
  // UUIDs and Mongo ObjectIds are unhelpful at full length; show the head and tail so it remains identifiable when comparing rows.
  if (!s) return "";
  if (s.length > 12) return `${s.slice(0, 6)}…${s.slice(-4)}`;
  return s;
}

// Map an action code to a verb bucket used for color-coding rows.
export function verbOf(action) {
  if (!action || typeof action !== "string") return "other";
  if (/\.(create|invite|upload|connect)$/.test(action)) return "created";
  if (/\.(update|edit|role_change)$/.test(action)) return "updated";
  if (/\.(delete|remove|disconnect|disable|cancel)$/.test(action)) return "deleted";
  if (/\.(execute|run_now)$/.test(action)) return "executed";
  if (/\.export$/.test(action)) return "exported";
  if (/\.violation$/.test(action)) return "flagged";
  return "other";
}

export function toDateInput(d) {
  // YYYY-MM-DD for <input type="date">
  return d.toISOString().slice(0, 10);
}
