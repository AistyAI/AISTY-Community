import React, { useEffect, useState } from "react";
import { fetchWithHankoAuth } from "../utils/verifiedCall";
import { useWorkspaceRole, canEditCompany } from "../utils/WorkspaceRoleContext";
import { Button, ShieldIcon, BinIcon, useToast } from "../../ui";
import { API_URL } from "../../config";

const cleanError = (err) => String(err?.message || err).replace(/^Failed to fetch [^:]+: /, "");

// Workspace IP allowlist.
export default function IpAccess() {
  const { role, companyData, refresh } = useWorkspaceRole();
  const { addToast } = useToast();
  const canEdit = canEditCompany(role);
  const [list, setList] = useState([]);
  const [entry, setEntry] = useState("");
  const [myIp, setMyIp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setList(companyData?.allowedIps || []); }, [companyData]);
  useEffect(() => {
    fetchWithHankoAuth(`${API_URL}/me/ip`).then((r) => setMyIp(r.ip)).catch(() => {});
  }, []);

  const save = async (next, message) => {
    setSaving(true);
    setError("");
    try {
      await fetchWithHankoAuth(`${API_URL}/company/me`, { method: "PUT", body: JSON.stringify({ allowedIps: next }) });
      setList(next);
      setEntry("");
      addToast(message, "success");
      refresh?.();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setSaving(false);
    }
  };

  const add = (value) => {
    const v = value.trim();
    if (!v) return;
    if (list.includes(v)) { setError(`${v} is already on the list.`); return; }
    // The first entry must be the caller's own address, or they would lock themselves out.
    const next = list.length === 0 && myIp && v !== myIp ? [myIp, v] : [...list, v];
    save(next, next.length > list.length + 1 ? `Added ${v} and your own address.` : `Added ${v}.`);
  };

  return (
    <section className="ipAccess">
      <header className="ipAccess__head">
        <div>
          <h2><ShieldIcon size={18} /> IP access</h2>
          <p>
            Only allow the workspace to be used from the networks you list. Leave the list empty to allow any network.
            Aisty checks every request; for enforcement at the network edge, add the same addresses to your server's
            firewall too.
          </p>
        </div>
      </header>

      {canEdit && (
        <form className="ipAccess__add" onSubmit={(e) => { e.preventDefault(); add(entry); }}>
          <input className="inputField" value={entry} onChange={(e) => setEntry(e.target.value)}
            placeholder="203.0.113.5 or 203.0.113.0/24" aria-label="IP address or range" />
          <Button type="submit" variant="secondary" disabled={saving || !entry.trim()}>Add</Button>
          {myIp && !list.includes(myIp) && (
            <Button type="button" variant="secondary" disabled={saving} onClick={() => add(myIp)}>Add my address ({myIp})</Button>
          )}
        </form>
      )}
      {error && <p className="ipAccess__error" role="alert">{error}</p>}

      {list.length === 0 ? (
        <p className="ipAccess__empty">No restriction. The workspace can be reached from any network.</p>
      ) : (
        <ul className="ipAccess__list">
          {list.map((ip) => (
            <li key={ip}>
              <code>{ip}</code>
              {ip === myIp && <span className="ipAccess__you">Your address</span>}
              {canEdit && (
                <button type="button" aria-label={`Remove ${ip}`} disabled={saving}
                  onClick={() => save(list.filter((x) => x !== ip), `Removed ${ip}.`)}>
                  <BinIcon size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!canEdit && <p className="ipAccess__empty">Only owners and admins can change this.</p>}
    </section>
  );
}
