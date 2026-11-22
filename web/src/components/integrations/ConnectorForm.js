// components/integrations/ConnectorForm.js
import React, { useMemo, useState } from "react";
import { Button, Input, Select, Textarea } from '../../ui';
import { errorText } from "./integrationsApi";

function initialState(fields, initial) {
  const state = {};
  for (const f of fields) {
    state[f.key] = f.initial !== undefined ? f.initial : f.type === "checkbox" ? false : "";
  }
  return { ...state, ...(initial || {}) };
}

// Keys, tokens, passwords and key files are secrets: they are handed to onSubmit separately so the caller seals them before anything is sent.
export const isSecretField = (f) => f.secret === true || f.type === "password" || f.type === "file-json";

// Credential form driven by a field list (text, password, select, textarea, checkbox, file-json).
export default function ConnectorForm({ fields, initial, submitLabel = "Connect", onSubmit, validate, help }) {
  const [form, setForm] = useState(() => initialState(fields, initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const visible = useMemo(() => fields.filter((f) => !f.showIf || f.showIf(form)), [fields, form]);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const missing = visible.find((f) => f.required && f.type !== "checkbox" && !String(form[f.key] || "").trim());
    if (missing) return setError(`${missing.label} is required.`);
    const invalid = validate?.(form);
    if (invalid) return setError(invalid);

    // Only submit fields that are showing, trimmed.
    const plain = {};
    const secrets = {};
    for (const f of visible) {
      const v = form[f.key];
      (isSecretField(f) ? secrets : plain)[f.key] = typeof v === "string" ? v.trim() : v;
    }
    try {
      setSaving(true);
      setError("");
      await onSubmit(plain, secrets);
      // Nothing secret stays in component state after a successful submit.
      setForm((prev) => {
        const next = { ...prev };
        for (const f of fields) if (isSecretField(f)) next[f.key] = "";
        return next;
      });
    } catch (err) {
      setError(errorText(err, "Could not connect."));
    } finally {
      setSaving(false);
    }
  };

  const readJsonFile = (key) => (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set(key, String(reader.result || ""));
    reader.readAsText(file);
  };

  return (
    <form className="connectorForm" onSubmit={submit}>
      {help && <p className="connectorForm__help">{help}</p>}
      {visible.map((f) => {
        if (f.type === "select") {
          return (
            <Select key={f.key} label={f.label} value={form[f.key]} options={f.choices}
              onValueChange={(v) => set(f.key, String(v))} />
          );
        }
        if (f.type === "checkbox") {
          return (
            <label key={f.key} className="connectorForm__check">
              <input type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => set(f.key, e.target.checked)} />
              <span>{f.label}</span>
            </label>
          );
        }
        if (f.type === "textarea" || f.type === "file-json") {
          return (
            <div key={f.key} className="connectorForm__area">
              <Textarea label={f.label} value={form[f.key]} placeholder={f.placeholder} rows={f.rows || 4}
                onChange={(e) => set(f.key, e.target.value)} spellCheck={false} />
              {f.type === "file-json" && (
                <label className="connectorForm__file">
                  <input type="file" accept="application/json,.json" onChange={readJsonFile(f.key)} />
                  Upload JSON file
                </label>
              )}
            </div>
          );
        }
        return (
          <Input key={f.key} label={f.label} type={f.type || "text"} placeholder={f.placeholder}
            value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} autoComplete="off" />
        );
      })}
      {error && <p className="connectorForm__error" role="alert">{error}</p>}
      <div className="connectorForm__actions">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Connecting…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
