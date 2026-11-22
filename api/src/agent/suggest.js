// AI ticket suggestions from the workspace's goals.
import { companyView } from "../company.js";
import { config } from "../config.js";
import { chat, ModelError } from "./models.js";
import { loadModelConfig } from "./plans.js";

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(body);
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function suggestTickets(job) {
  const company = await companyView(job.company_id);
  const model = await loadModelConfig(job.company_id);
  if (!model) throw new ModelError("Connect an AI model in Settings → Model to get suggestions.");

  const goals = company.goals.map((g) => ({ goalId: g.goalId, title: g.title, description: g.description, target: g.target }));
  const open = company.tickets.filter((t) => !["completed", "cancelled"].includes(t.status)).map((t) => t.title).slice(0, 80);
  const integrations = company.connectedServices.map((s) => s.provider);

  const reply = await chat(model, {
    system: "You plan work for a company's AI operator. Reply with JSON only, no prose.",
    messages: [{
      role: "user",
      content: `Company: ${company.name}${company.sector ? ` (${company.sector})` : ""}
About: ${company.description || "–"}
Areas of work: ${company.areasOfWork.join(", ") || "–"}
KPIs: ${company.kpis.map((k) => k.name).join(", ") || "–"}
Connected tools the AI can use: ${integrations.join(", ") || "none yet"}
Existing goals (JSON): ${JSON.stringify(goals)}
Tickets already planned: ${JSON.stringify(open)}

Suggest up to 3 goals' worth of new tickets an AI operator could carry out with the connected tools, without duplicating planned tickets. Use existing goals where they fit (copy their goalId, isNew false); propose at most 1 new goal (isNew true, no goalId). Each goal gets 2 to 4 tickets with a concrete title (under 80 characters) and a description saying exactly what to do and what "done" looks like.

JSON shape: {"goals":[{"goalId":"…or omit","isNew":false,"title":"…","description":"…","tickets":[{"title":"…","description":"…"}]}]}`,
    }],
    timeoutMs: config.agent.stepTimeoutMs,
  });

  let parsed;
  try { parsed = extractJson(reply.text); } catch { throw new ModelError("The model did not return usable suggestions. Try again."); }
  const known = new Set(goals.map((g) => g.goalId));
  const out = (Array.isArray(parsed?.goals) ? parsed.goals : []).slice(0, 4).map((g) => {
    const existing = typeof g.goalId === "string" && known.has(g.goalId);
    return {
      ...(existing ? { goalId: g.goalId } : {}),
      isNew: !existing,
      title: str(g.title, 200) || "Suggested goal",
      description: str(g.description, 2000),
      tickets: (Array.isArray(g.tickets) ? g.tickets : []).slice(0, 5).map((t) => ({ title: str(t.title, 200), description: str(t.description, 4000) })).filter((t) => t.title),
    };
  }).filter((g) => g.tickets.length);
  return { goals: out };
}
