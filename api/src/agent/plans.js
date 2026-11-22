// Plans: what the agent proposes to change, how risky that is, and how the approval card shows it.
import { sha256 } from "../crypto.js";
import { one } from "../db.js";
import { openJson } from "../crypto.js";

const RANK = { low: 0, medium: 1, critical: 2 };

export function planRisk(actions) {
  return actions.reduce((worst, a) => (RANK[a.risk] > RANK[worst] ? a.risk : worst), "low");
}

// Does the policy hold this plan for a person?
export function shouldHold(level, risk) {
  if (level === "off") return false;
  if (level === "all") return true;
  if (level === "medium") return RANK[risk] >= RANK.medium;
  return RANK[risk] >= RANK.critical;
}

/** Same tools in the same order: what a recurring approval is pinned to. */
export const fingerprint = (actions) => sha256(actions.map((a) => a.tool).join(">"));

const humanise = (tool) => tool.replace(/^[a-z]+_/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function approvalCard(row, plan, ticket) {
  return {
    approvalId: row.approval_id,
    kind: "ticket_workflow",
    status: row.status,
    risk: row.risk,
    ticketId: row.ticket_id,
    ticketTitle: ticket?.title || "",
    summary: plan?.summary || "",
    createdAt: row.created_at,
    steps: (plan?.actions || []).map((a, i) => ({
      index: i + 1,
      type: a.tool,
      label: `${a.providerName}: ${humanise(a.tool)}`,
      description: a.reason || "",
      risk: a.risk,
      args: a.args,
    })),
  };
}

export async function loadModelConfig(companyId) {
  const row = await one("SELECT * FROM model_config WHERE company_id = $1", [companyId]);
  if (!row) return null;
  return {
    provider: row.provider,
    baseUrl: row.base_url,
    model: row.model,
    apiKey: row.sealed_key ? openJson(row.sealed_key, `model:${companyId}`) : null,
  };
}
