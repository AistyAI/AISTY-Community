// The integrations Aisty Free ships.
import github from "./github.js";
import jira from "./jira.js";
import slack from "./slack.js";
import hubspot from "./hubspot.js";
import gmail from "./gmail.js";
import { query } from "../../db.js";
import { openJson } from "../../crypto.js";

export const PROVIDERS = Object.fromEntries([github, jira, slack, hubspot, gmail].map((p) => [p.key, p]));

// read → runs without asking; write → changes data; outbound → leaves the building (messages, email).
export const RISK = { read: "low", write: "medium", outbound: "critical" };

/** Every tool the agent may use for a workspace, bound to its credentials. */
export async function toolsFor(companyId) {
  const { rows } = await query("SELECT provider, meta, sealed FROM integrations WHERE company_id = $1", [companyId]);
  const tools = [];
  for (const row of rows) {
    const provider = PROVIDERS[row.provider];
    if (!provider) continue;
    const secrets = openJson(row.sealed, `integration:${companyId}:${row.provider}`);
    const ctx = { meta: row.meta, secrets };
    for (const t of provider.tools) {
      tools.push({ ...t, provider: provider.key, providerName: provider.name, riskLevel: RISK[t.risk], call: (args) => t.run(args, ctx) });
    }
  }
  return tools;
}

/** Minimal JSON-schema check for tool arguments the model produced. */
export function validateArgs(tool, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "Arguments must be an object.";
  if (args.__invalid_json) return "Arguments were not valid JSON.";
  const props = tool.parameters?.properties || {};
  for (const req of tool.parameters?.required || []) {
    if (args[req] === undefined || args[req] === null || args[req] === "") return `Missing required argument "${req}".`;
  }
  for (const [k, v] of Object.entries(args)) {
    const spec = props[k];
    if (!spec) return `Unknown argument "${k}".`;
    if (spec.type === "string" && typeof v !== "string") return `"${k}" must be text.`;
    if (spec.type === "integer" && !Number.isInteger(v)) return `"${k}" must be a whole number.`;
    if (spec.type === "array" && !Array.isArray(v)) return `"${k}" must be a list.`;
    if (spec.enum && !spec.enum.includes(v)) return `"${k}" must be one of ${spec.enum.join(", ")}.`;
    if (typeof v === "string" && v.length > 20000) return `"${k}" is too long.`;
  }
  return null;
}
