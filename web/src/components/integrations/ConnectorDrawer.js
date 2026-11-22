// components/integrations/ConnectorDrawer.js
import React, { useEffect, useRef, useState } from "react";
import ConnectorForm from "./ConnectorForm";
import { StatusPill, STATUS_TEXT } from "./ConnectorCard";
import { CATEGORY_LABELS } from "./catalog";
import { errorText, integrationsApi, submitConnection } from "./integrationsApi";
import { createResponseKey, openSealed } from "./sealing";
import { LockedPanel } from "../free/LockedFeature";
import { LockIcon } from "../../ui";

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) { /* clipboard blocked: the value is selectable */ }
  };
  return (
    <div className="copyField">
      <span className="copyField__label">{label}</span>
      <div className="copyField__row">
        <code>{value}</code>
        <button type="button" className="linkButton" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}

export default function ConnectorDrawer({ connector, state, rows, grants, companyId, refresh, notify, onClose }) {
  const closeRef = useRef(null);
  const [showForm, setShowForm] = useState(false);
  const [scimResult, setScimResult] = useState(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setShowForm(false);
    setScimResult(null);
  }, [connector.key]);

  const { connect } = connector;
  const connected = state.status !== "available";

  const disconnect = async () => {
    if (!window.confirm(`Disconnect ${connector.name}? The AI stops using it and the stored credentials are deleted.`)) return;
    try {
      await integrationsApi(`/${connector.key}/disconnect`, { method: "POST", body: { companyId } });
      notify(`${connector.name} disconnected.`, "success");
      refresh();
    } catch (err) {
      notify(errorText(err, `Could not disconnect ${connector.name}.`), "error");
    }
  };

  const submitForm = async (plain, secrets) => {
    let result;
    if (connect.result === "scim") {
      // The token is generated server-side and comes back sealed to a key that exists only in this page.
      const responseKey = await createResponseKey();
      result = await integrationsApi(connect.endpoint, {
        method: "POST", body: { companyId, ...plain, responseKey: responseKey.publicKey },
      });
      const { token } = await openSealed(responseKey.privateKey, result.sealed, `scim:${companyId}`);
      setScimResult({ token, baseUrl: result.baseUrl });
    } else {
      result = await submitConnection(connect.endpoint, connect.sealAs || connector.key, companyId, plain, secrets);
      setShowForm(false);
    }
    notify(result?.warning ? `${result.message}: ${result.warning}` : result?.message || `${connector.name} connected.`,
      result?.warning ? "error" : "success");
    refresh();
  };

  const formVisible = connect.kind === "form" && (!connected || showForm);

  let body;
  if (connector.locked) {
    body = (
      <section className="drawerSection">
        <LockedPanel feature="integrations">
          {connector.name} is available on hosted Aisty, maintained and tested by us, with the same approval gates and audit trail.
        </LockedPanel>
      </section>
    );
  } else {
    body = (
      <section className="drawerSection">
        <h4 className="drawerSection__title">Connection</h4>
        {connected && (
          <div className="connectionSummary">
            <div>
              <div className="connectionSummary__title">{state.summary || "Connected"}</div>
              {rows[0]?.meta?.connectedAt && (
                <div className="connectionSummary__meta">Since {new Date(rows[0].meta.connectedAt).toLocaleDateString()}</div>
              )}
            </div>
            <div className="connectionSummary__actions">
              {!showForm && (
                <button type="button" className="linkButton" onClick={() => setShowForm(true)}>
                  {connector.reconnectLabel || "Replace credentials"}
                </button>
              )}
              <button type="button" className="linkButton linkButton--danger" onClick={disconnect}>Disconnect</button>
            </div>
          </div>
        )}

        {formVisible && (
          <ConnectorForm key={`${connector.key}-${connected}`} fields={connect.fields} help={connect.help}
            validate={connect.validate} submitLabel={connect.submitLabel || (connected ? "Save" : "Connect")}
            onSubmit={submitForm} />
        )}
        {formVisible && connected && (
          <button type="button" className="linkButton" onClick={() => setShowForm(false)}>Cancel</button>
        )}

        {scimResult?.token && (
          <div className="notice notice--info">
            <strong>Copy this token now. It will not be shown again.</strong>
            <CopyField label="SCIM base URL" value={scimResult.baseUrl} />
            <CopyField label="Bearer token" value={scimResult.token} />
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="drawerOverlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="drawer__header">
          <span className="drawer__logo">{connector.logo}</span>
          <div className="drawer__titles">
            <h3 id="drawer-title">{connector.name}</h3>
            <span className="drawer__category">{CATEGORY_LABELS[connector.category]}</span>
          </div>
          {connector.locked ? <span className="lockBadge"><LockIcon size={12} /> Hosted</span> : <StatusPill status={state.status}>{STATUS_TEXT[state.status]}</StatusPill>}
          <button ref={closeRef} type="button" className="drawer__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="drawer__body">
          <p className="drawer__description">{connector.description}</p>
          {state.attention && <div className="notice notice--danger">{state.attention}</div>}

          {body}

          {connector.note && <div className="notice">{connector.note}</div>}

          <section className="drawerSection">
            <h4 className="drawerSection__title">{connector.platform ? "What it does" : "What the AI can do"}</h4>
            <ul className="capabilityList">
              {connector.capabilities.map((c) => <li key={c}>{c}</li>)}
            </ul>
            {!connector.platform && (
              <p className="drawerSection__hint">
                Actions that write, send or move money follow your workspace approval policy.
              </p>
            )}
          </section>

          <section className="drawerSection drawerSection--muted">
            <h4 className="drawerSection__title">Security</h4>
            <p className="drawerSection__hint">
              {connector.security ||
                "Keys are encrypted in your browser before they are sent, so they can't be read in transit. They are stored in the secret vault, never shown again, and deleted when you disconnect."}
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
