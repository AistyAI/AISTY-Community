import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithHankoAuth } from "../utils/verifiedCall";
import { useWorkspaceRole } from "../utils/WorkspaceRoleContext";
import { sealFields } from "../integrations/sealing";
import { KVRUN, openUpgrade } from "../../edition";
import { Button, Input, ModelIcon, useToast } from "../../ui";
import "./free.css";
import { API_URL } from "../../config";


const CHOICES = [
  {
    key: "kvrun",
    title: "Deploy a private model with kvrun",
    badge: "Recommended partner",
    body: KVRUN.pitch,
    baseUrlHint: "https://<your-kvrun-endpoint>/v1",
    modelHint: "qwen3.6-35b-a3b",
  },
  {
    key: "openai-compatible",
    title: "Any OpenAI-compatible endpoint",
    body: "vLLM, Ollama, LM Studio, OpenAI, Groq, Together or your own server. Prompts go wherever this endpoint is hosted.",
    baseUrlHint: "http://ollama:11434/v1",
    modelHint: "qwen3:32b",
  },
  {
    key: "anthropic",
    title: "Anthropic",
    body: "Claude models through the Anthropic API.",
    modelHint: "claude-opus-5-5",
  },
  {
    key: "gemini",
    title: "Google Gemini",
    body: "Gemini models through the Gemini API.",
    modelHint: "gemini-model-name",
  },
];

const THIRD_PARTY = new Set(["anthropic", "gemini"]);

/** Settings → Model: Aisty Free brings no model of its own. */
export default function ModelSettings({ onSaved, compact = false }) {
  const { addToast } = useToast();
  const { companyId } = useWorkspaceRole();
  const [state, setState] = useState(null);
  const [provider, setProvider] = useState("kvrun");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState(null);

  const load = useCallback(async () => {
    const data = await fetchWithHankoAuth(`${API_URL}/model`);
    setState(data);
    if (data.configured) {
      setProvider(data.provider);
      setBaseUrl(data.baseUrl || "");
      setModel(data.model || "");
    }
  }, []);

  useEffect(() => { load().catch(() => setState({ configured: false, canEdit: false })); }, [load]);

  const choice = useMemo(() => CHOICES.find((c) => c.key === provider), [provider]);
  const needsBaseUrl = provider === "kvrun" || provider === "openai-compatible";
  const canEdit = Boolean(state?.canEdit);

  const save = async () => {
    setSaving(true);
    setTest(null);
    try {
      let sealed;
      if (apiKey.trim()) {
        const info = await fetchWithHankoAuth(`${API_URL}/integrations/sealing-key`);
        sealed = await sealFields(info, "model", companyId, { apiKey: apiKey.trim() });
      }
      await fetchWithHankoAuth(`${API_URL}/model`, {
        method: "PUT",
        body: JSON.stringify({ provider, baseUrl: needsBaseUrl ? baseUrl : undefined, model: model || choice.modelHint, sealed }),
      });
      setApiKey("");
      await load();
      addToast("Model connected. Testing it now…", "success");
      await runTest();
      onSaved?.();
    } catch (err) {
      addToast(String(err.message || err).replace(/^Failed to fetch [^:]+: /, ""), "error");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      setTest(await fetchWithHankoAuth(`${API_URL}/model/test`, { method: "POST" }));
    } catch (err) {
      setTest({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (!state) return <p className="secondary-text">Loading…</p>;

  return (
    <div className={`modelSettings${compact ? " modelSettings--compact" : ""}`}>
      {!compact && (
        <div className="modelSettings__intro">
          <h3><ModelIcon size={18} /> AI model</h3>
          <p>Your workspace runs on a model you connect. Every ticket, chat, plan and suggestion uses it.</p>
          {state.configured && (
            <p className="modelSettings__current">
              Connected: <b>{state.providers?.find((p) => p.key === state.provider)?.label || state.provider}</b> · <code>{state.model}</code>
              {state.updatedBy ? <> · set by {state.updatedBy}</> : null}
            </p>
          )}
        </div>
      )}

      <div className="modelChoices" role="radiogroup" aria-label="Model provider">
        {CHOICES.map((c) => (
          <button
            type="button" key={c.key} role="radio" aria-checked={provider === c.key} disabled={!canEdit}
            className={`modelChoice${provider === c.key ? " is-selected" : ""}${c.key === "kvrun" ? " modelChoice--partner" : ""}`}
            onClick={() => { setProvider(c.key); setTest(null); }}
          >
            <span className="modelChoice__title">{c.title}</span>
            {c.badge && <span className="modelChoice__badge">{c.badge}</span>}
            <span className="modelChoice__body">{c.body}</span>
          </button>
        ))}
      </div>

      {provider === "kvrun" && (
        <div className="partnerCard">
          <div>
            <b>No endpoint yet?</b> kvrun deploys open models such as Qwen, DeepSeek, Gemma and Mistral on
            dedicated GPUs with encrypted, per-tenant caches and audit logs. Deploy one, then paste its base URL and key here.
          </div>
          <div className="partnerCard__links">
            <a className="btn primary medium" href={KVRUN.home} target="_blank" rel="noopener noreferrer">Set up with kvrun</a>
            <a className="btn secondary medium" href={KVRUN.quickstart} target="_blank" rel="noopener noreferrer">Quickstart</a>
          </div>
        </div>
      )}

      {THIRD_PARTY.has(provider) && (
        <div className="dataNotice">
          Prompts and tool results are sent to {choice.title}. To keep them private, use a dedicated deployment with kvrun,
          or let hosted Aisty run a private model on hardware reserved for you.
          <button type="button" onClick={() => openUpgrade("model-residency")}>Ask about a private model</button>
        </div>
      )}

      <div className="modelForm">
        {needsBaseUrl && (
          <Input label="Base URL" value={baseUrl} placeholder={choice.baseUrlHint} disabled={!canEdit} onChange={(e) => setBaseUrl(e.target.value)} />
        )}
        <Input label="Model" value={model} placeholder={choice.modelHint} disabled={!canEdit} onChange={(e) => setModel(e.target.value)} />
        <Input
          label={state.hasKey && state.provider === provider ? "API key (saved; leave blank to keep it)" : provider === "openai-compatible" ? "API key (if your endpoint needs one)" : "API key"}
          type="password" value={apiKey} autoComplete="off" disabled={!canEdit} onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="modelForm__note">Your key is encrypted in this browser before it is sent, and stored encrypted with this deployment's master key.</p>
        <div className="modelForm__actions">
          <Button onClick={save} disabled={!canEdit || saving || (needsBaseUrl && !baseUrl)}>{saving ? "Saving…" : state.configured ? "Save and test" : "Connect model"}</Button>
          {state.configured && <Button variant="secondary" onClick={runTest} disabled={!canEdit || testing}>{testing ? "Testing…" : "Test connection"}</Button>}
        </div>
        {!canEdit && <p className="modelForm__note">Only owners and admins can change the model.</p>}
        {test && (
          <div className={`modelTest ${test.ok ? "modelTest--ok" : "modelTest--fail"}`}>
            {test.ok ? <>Connected in {(test.latencyMs / 1000).toFixed(1)}s. The model said: “{test.reply}”</> : <>Test failed: {test.error}</>}
          </div>
        )}
      </div>
    </div>
  );
}
