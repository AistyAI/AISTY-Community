// Chat: the connected model, the company context and read-only tools.
import { config } from "../config.js";
import { chat } from "./models.js";
import { toolsFor, validateArgs } from "./providers/index.js";
import { clip } from "./providers/http.js";
import { loadModelConfig } from "./plans.js";
import { companyView } from "../company.js";
import { audit } from "../audit.js";

const MAX_STEPS = 6;

function contextFor(c) {
  return [
    `Company: ${c.name}${c.sector ? ` (${c.sector})` : ""}`,
    c.description && `About: ${c.description}`,
    c.goals?.length && `Goals: ${c.goals.map((g) => g.title).join("; ")}`,
    c.products?.length && `Products: ${c.products.map((p) => p.name).join(", ")}`,
  ].filter(Boolean).join("\n");
}

// Answer the latest user message.
export async function respond({ companyId, user, history }) {
  const model = await loadModelConfig(companyId);
  if (!model) {
    return { content: "No AI model is connected yet. An owner or admin can connect one in **Settings → Model**.", steps: [] };
  }
  const company = await companyView(companyId);
  const tools = (await toolsFor(companyId)).filter((t) => t.risk === "read");
  const byName = new Map(tools.map((t) => [t.name, t]));
  const system = `You are Aisty, an AI assistant for the company below. Answer clearly and concisely in Markdown.

${contextFor(company)}

You can look things up in the connected tools${tools.length ? ` (${[...new Set(tools.map((t) => t.providerName))].join(", ")})` : " (none are connected yet)"}. Never invent facts, names, numbers or links. In chat you cannot change anything in those systems: if the person wants something done, say what you would do and suggest they use "Run as task", which turns it into a ticket that follows the workspace's approval rules.`;

  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  const steps = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    const reply = await chat(model, {
      system,
      messages,
      tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
      timeoutMs: config.agent.stepTimeoutMs,
    });
    messages.push(reply.assistant);
    if (!reply.toolCalls.length) return { content: reply.text || "…", steps };
    for (const call of reply.toolCalls) {
      const tool = byName.get(call.name);
      let content;
      let status = "ok";
      const problem = tool ? validateArgs(tool, call.args) : `There is no tool called ${call.name}.`;
      if (problem) { content = `Not run: ${problem}`; status = "error"; } else {
        try {
          content = clip(await tool.call(call.args));
        } catch (err) {
          content = `The tool failed: ${err.message}`;
          status = "error";
        }
        await audit({
          companyId, userId: user.userId, userEmail: user.email, action: "ai.tool.executed", resource: tool.provider,
          metadata: { tool: tool.name, risk: tool.riskLevel, outcome: status === "ok" ? "ok" : "error", approvalMode: "auto", approved: false, source: "chat" },
        });
      }
      steps.push({
        tool: call.name,
        label: tool ? `${tool.providerName}: ${call.name.replace(/^[a-z]+_/, "").replace(/_/g, " ")}` : call.name,
        status,
        risk: tool?.riskLevel || "low",
        args: JSON.stringify(call.args || {}),
        result: content.slice(0, 2000),
      });
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content });
    }
  }
  return { content: "I looked into this but ran out of steps before finishing. Try a narrower question.", steps };
}
