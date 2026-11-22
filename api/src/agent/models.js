// Model adapters.
import Anthropic from "@anthropic-ai/sdk";

export const PROVIDERS = {
  kvrun: { label: "kvrun private deployment", dialect: "openai", needsBaseUrl: true, keyRequired: true },
  "openai-compatible": { label: "OpenAI-compatible endpoint", dialect: "openai", needsBaseUrl: true, keyRequired: false },
  anthropic: { label: "Anthropic", dialect: "anthropic", needsBaseUrl: false, keyRequired: true, defaultModel: "claude-opus-5-5" },
  gemini: { label: "Google Gemini", dialect: "gemini", needsBaseUrl: false, keyRequired: true },
};

// Models whose Messages API supports server-side refusal fallbacks.
const FALLBACK_MODELS = new Set(["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export class ModelError extends Error {}

const stripThinking = (text) => String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

function safeParse(json) {
  if (json && typeof json === "object") return json;
  try { return JSON.parse(json || "{}"); } catch { return { __invalid_json: String(json).slice(0, 500) }; }
}

/* OpenAI-compatible (kvrun, vLLM, Ollama, LM Studio, OpenAI, Groq) */

async function openaiChat(cfg, { system, messages, tools, timeoutMs }) {
  const body = {
    model: cfg.model,
    messages: [
      { role: "system", content: system },
      ...messages.map((m) => {
        if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
        if (m.role === "assistant") {
          return {
            role: "assistant",
            content: m.content || null,
            ...(m.toolCalls?.length ? {
              tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })),
            } : {}),
          };
        }
        return { role: "user", content: m.content };
      }),
    ],
    ...(tools?.length ? { tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })), tool_choice: "auto" } : {}),
  };
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((err) => { throw new ModelError(`Could not reach the model endpoint: ${err.message}`); });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ModelError(`The model endpoint returned ${res.status}: ${data?.error?.message || data?.error || res.statusText}`);
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new ModelError("The model endpoint returned no message.");
  const toolCalls = (msg.tool_calls || []).map((c, i) => ({
    id: c.id || `call_${i}_${Date.now()}`,
    name: c.function?.name,
    args: safeParse(c.function?.arguments),
  }));
  const text = stripThinking(msg.content);
  return { text, toolCalls, assistant: { role: "assistant", content: text, toolCalls } };
}

// Anthropic (official SDK)

function anthropicMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === "tool") {
      const block = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content, ...(m.isError ? { is_error: true } : {}) };
      const last = out[out.length - 1];
      // All results for one assistant turn go back in a single user message.
      if (last?.role === "user" && Array.isArray(last.content) && last.content.every((b) => b.type === "tool_result")) last.content.push(block);
      else out.push({ role: "user", content: [block] });
    } else if (m.role === "assistant") {
      // Replay the model's own content blocks unchanged (thinking blocks included).
      out.push({
        role: "assistant",
        content: m.raw || [
          ...(m.content ? [{ type: "text", text: m.content }] : []),
          ...(m.toolCalls || []).map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.args || {} })),
        ],
      });
    } else {
      out.push({ role: "user", content: m.content });
    }
  }
  return out;
}

async function anthropicChat(cfg, { system, messages, tools, timeoutMs }) {
  const client = new Anthropic({ apiKey: cfg.apiKey, timeout: timeoutMs, maxRetries: 2 });
  const params = {
    model: cfg.model || PROVIDERS.anthropic.defaultModel,
    max_tokens: 16000,
    system,
    messages: anthropicMessages(messages),
    ...(tools?.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
  };
  let response;
  try {
    if (FALLBACK_MODELS.has(params.model)) {
      try {
        // On a safety decline the API re-runs the request on a fallback model.
        response = await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
      } catch (err) {
        if (!(err instanceof Anthropic.BadRequestError)) throw err;
        response = await client.messages.create(params);
      }
    } else {
      response = await client.messages.create(params);
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new ModelError("Anthropic rejected the API key.");
    if (err instanceof Anthropic.NotFoundError) throw new ModelError(`Anthropic does not recognise the model "${params.model}".`);
    if (err instanceof Anthropic.RateLimitError) throw new ModelError("Anthropic rate limit reached. The ticket will retry.");
    if (err instanceof Anthropic.APIError) throw new ModelError(`Anthropic returned an error: ${err.message}`);
    throw new ModelError(`Could not reach Anthropic: ${err.message}`);
  }
  if (response.stop_reason === "refusal") {
    throw new ModelError(`The model declined this request${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : "."}`);
  }
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  const toolCalls = response.content.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, args: b.input || {} }));
  const raw = response.content.filter((b) => b.type !== "fallback");
  return { text, toolCalls, assistant: { role: "assistant", content: text, toolCalls, raw } };
}

// Google Gemini

const GEMINI_SCHEMA_KEYS = new Set(["type", "description", "properties", "required", "items", "enum", "format", "nullable"]);
function geminiSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!GEMINI_SCHEMA_KEYS.has(k)) continue;
    if (k === "properties") out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, geminiSchema(pv)]));
    else if (k === "items") out.items = geminiSchema(v);
    else out[k] = v;
  }
  return out;
}

async function geminiChat(cfg, { system, messages, tools, timeoutMs }) {
  const contents = [];
  for (const m of messages) {
    if (m.role === "tool") {
      const part = { functionResponse: { name: m.name, response: { content: m.content } } };
      const last = contents[contents.length - 1];
      if (last?.role === "user" && last.parts.every((p) => p.functionResponse)) last.parts.push(part);
      else contents.push({ role: "user", parts: [part] });
    } else if (m.role === "assistant") {
      contents.push({
        role: "model",
        parts: m.raw || [
          ...(m.content ? [{ text: m.content }] : []),
          ...(m.toolCalls || []).map((c) => ({ functionCall: { name: c.name, args: c.args || {} } })),
        ],
      });
    } else {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    }
  }
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    ...(tools?.length ? { tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.parameters) })) }] } : {}),
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((err) => { throw new ModelError(`Could not reach Gemini: ${err.message}`); });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ModelError(`Gemini returned ${res.status}: ${data?.error?.message || res.statusText}`);
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("\n").trim();
  const toolCalls = parts.filter((p) => p.functionCall).map((p, i) => ({ id: `gem_${i}_${Date.now()}`, name: p.functionCall.name, args: p.functionCall.args || {} }));
  return { text, toolCalls, assistant: { role: "assistant", content: text, toolCalls, raw: parts } };
}

export async function chat(cfg, request) {
  const dialect = PROVIDERS[cfg.provider]?.dialect;
  const timeoutMs = request.timeoutMs || 180_000;
  if (dialect === "openai") return openaiChat(cfg, { ...request, timeoutMs });
  if (dialect === "anthropic") return anthropicChat(cfg, { ...request, timeoutMs });
  if (dialect === "gemini") return geminiChat(cfg, { ...request, timeoutMs });
  throw new ModelError("No model is connected. An owner or admin can connect one in Settings → Model.");
}
