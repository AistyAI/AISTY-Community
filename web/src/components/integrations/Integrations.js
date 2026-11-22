// Connector catalogue with search, filters and a connect drawer.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from '../../ui';
import ConnectorCard from "./ConnectorCard";
import { UpgradeNudge } from "../free/LockedFeature";
import ConnectorDrawer from "./ConnectorDrawer";
import { CATEGORIES, CONNECTORS, GRANT_PROVIDERS } from "./catalog";
import { loadCompany } from "./integrationsApi";
import "../../styles/integrations/page.css";
import "../../styles/integrations/drawer.css";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "connected", label: "Connected" },
  { key: "available", label: "Available" },
];

function connectorState(connector, rows) {
  if (!rows.length) return { status: "available", summary: "" };
  const reauth = rows.filter((r) => r.meta?.needsReauth);
  const attention =
    connector.attention?.(rows) ||
    (reauth.length ? `${reauth.length === 1 ? "A connection needs" : `${reauth.length} connections need`} reconnecting.` : null);
  let summary = connector.summary?.(rows) || "";
  if (connector.connect.kind === "email") {
    summary = rows.length === 1 ? rows[0].meta?.email || "1 mailbox" : `${rows.length} mailboxes`;
  }
  return { status: attention ? "attention" : "connected", summary, attention };
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function Section({ title, count, children }) {
  return (
    <section className="connectorSection" aria-label={title}>
      <h3 className="connectorSection__title">{title}<span className="count">{count}</span></h3>
      <div className="connectorGrid">{children}</div>
    </section>
  );
}

export default function Integrations() {
  const { addToast } = useToast();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openKey, setOpenKey] = useState(null);
  const searchRef = useRef(null);

  const refresh = useCallback(async ({ silent = true } = {}) => {
    try {
      if (!silent) setLoading(true);
      const c = await loadCompany();
      if (!c?._id) throw new Error("no company");
      setCompany(c);
      setError("");
    } catch (err) {
      if (!silent) setError("Integrations could not be loaded. Reload the page to try again.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh({ silent: false });
  }, [refresh]);

  // "/" focuses search, as on most catalogue pages.
  useEffect(() => {
    const onKey = (e) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      if (e.key === "/" && !typing && !openKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openKey]);

  const notify = useCallback((message, kind) => addToast(message, kind), [addToast]);

  const services = useMemo(() => company?.connectedServices || [], [company]);
  const rowsFor = useCallback(
    (key) => services.filter((s) => (s.provider || "").toLowerCase() === key),
    [services]
  );

  const entries = useMemo(
    () => CONNECTORS.map((c) => ({ connector: c, state: connectorState(c, rowsFor(c.key)) })),
    [rowsFor]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(({ connector, state }) => {
      if (category !== "all" && connector.category !== category) return false;
      if (statusFilter === "connected" && state.status === "available") return false;
      if (statusFilter === "available" && state.status !== "available") return false;
      if (!q) return true;
      return [connector.name, connector.description, connector.keywords, ...connector.capabilities]
        .join(" ").toLowerCase().includes(q);
    });
  }, [entries, query, category, statusFilter]);

  const connected = filtered.filter((e) => e.state.status !== "available");
  const available = filtered.filter((e) => e.state.status === "available" && !e.connector.locked);
  const hosted = filtered.filter((e) => e.connector.locked);
  const connectedTotal = entries.filter((e) => e.state.status !== "available").length;
  const attentionTotal = entries.filter((e) => e.state.status === "attention").length;
  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const { connector } of entries) counts[connector.category] = (counts[connector.category] || 0) + 1;
    return counts;
  }, [entries]);

  const open = openKey ? entries.find((e) => e.connector.key === openKey) : null;
  const closeDrawer = useCallback(() => setOpenKey(null), []);
  const clearFilters = () => { setQuery(""); setCategory("all"); setStatusFilter("all"); };
  const filtersActive = query || category !== "all" || statusFilter !== "all";

  const card = ({ connector, state }) => (
    <ConnectorCard key={connector.key} connector={connector} state={state} onOpen={() => setOpenKey(connector.key)} />
  );

  return (
    <div className="integrationsPage">
      <header className="integrationsHeader">
        <div>
          <h2>Integrations</h2>
          <p className="secondary-text">Connect the systems your teams work in. The AI acts only through what you connect here.</p>
        </div>
        <div className="integrationsHeader__stats" aria-live="polite">
          <span><strong>{connectedTotal}</strong> connected</span>
          {attentionTotal > 0 && <span className="integrationsHeader__attention"><strong>{attentionTotal}</strong> need attention</span>}
          <a className="integrationsHeader__docs" href="https://www.aisty.ai/docs" target="_blank" rel="noreferrer noopener">Guides ↗</a>
        </div>
      </header>

      <div className="connectorToolbar">
        <label className="connectorSearch">
          <SearchIcon />
          <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations" aria-label="Search integrations" />
          {!query && <kbd>/</kbd>}
        </label>
        <div className="segmented" role="tablist" aria-label="Connection status">
          {STATUS_FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={statusFilter === f.key}
              className={`segmented__item ${statusFilter === f.key ? "is-active" : ""}`} onClick={() => setStatusFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="categoryChips" role="group" aria-label="Category">
        <button type="button" className={`chip ${category === "all" ? "is-active" : ""}`} onClick={() => setCategory("all")}>
          All <span className="chip__count">{entries.length}</span>
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.key} type="button" className={`chip ${category === c.key ? "is-active" : ""}`}
            onClick={() => setCategory(category === c.key ? "all" : c.key)}>
            {c.label} <span className="chip__count">{categoryCounts[c.key] || 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="connectorGrid" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="connectorCard connectorCard--skeleton" />)}
        </div>
      ) : error ? (
        <p className="integrationError">{error}</p>
      ) : filtered.length === 0 ? (
        <div className="connectorEmpty">
          <p>No integrations match{query ? ` “${query}”` : " these filters"}.</p>
          {filtersActive && <button type="button" className="linkButton" onClick={clearFilters}>Clear filters</button>}
        </div>
      ) : (
        <>
          {connected.length > 0 && <Section title="Connected" count={connected.length}>{connected.map(card)}</Section>}
          {available.length > 0 && <Section title="Available" count={available.length}>{available.map(card)}</Section>}
          {hosted.length > 0 && (
            <>
              <UpgradeNudge cta="integrations-catalog">
                Xero, Stripe, Salesforce, Outlook and the rest of the catalogue come with hosted Aisty.
              </UpgradeNudge>
              <Section title="On hosted Aisty" count={hosted.length}>{hosted.map(card)}</Section>
            </>
          )}
        </>
      )}

      {open && company && (
        <ConnectorDrawer
          connector={open.connector}
          state={open.state}
          rows={rowsFor(open.connector.key)}
          grants={GRANT_PROVIDERS[open.connector.key] ? rowsFor(GRANT_PROVIDERS[open.connector.key]) : []}
          companyId={company._id}
          refresh={refresh}
          notify={notify}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
