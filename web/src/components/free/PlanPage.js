import React, { useEffect, useState } from "react";
import { fetchWithHankoAuth, authorizedFetch } from "../utils/verifiedCall";
import { useWorkspaceRole } from "../utils/WorkspaceRoleContext";
import { openUpgrade } from "../../edition";
import CoverageGap from "./CoverageGap";
import {
  useToast, CalendarIcon, CheckIcon, FolderIcon, HomeIcon, ModelIcon, PlugIcon, ScaleIcon, AuditIcon, ShieldIcon,
} from "../../ui";
import "./free.css";
import { API_URL } from "../../config";


// What the workspace has now, and what upgrading switches on.
const STACK = [
  ["Goals, tickets and chat", false],
  ["Approvals for Aisty's actions", false],
  ["Audit trail, last 90 days", false],
  ["AI tool monitoring for your team", true],
  ["Full audit history", true],
  ["Company Brain", true],
  ["Private model", true],
  ["Every integration", true],
];

const ADDS = [
  [FolderIcon, "Company Brain", "The agent reads your documents, SOPs and past work before it plans or answers."],
  [HomeIcon, "Progress dashboard", "KPIs against goals, work in flight, and what needs a decision, on one page."],
  [ModelIcon, "A private model", "Dedicated GPUs for your company, or a model fine-tuned on your data that you keep."],
  [PlugIcon, "Every integration", "Xero, Stripe, Outlook, Salesforce, NetSuite and more, maintained and tested by us."],
  [ScaleIcon, "Approval rules", "Hold actions by amount, route them to the owner of each system, require two approvers."],
  [AuditIcon, "Full history and evidence", "View and export your whole audit trail, auditor evidence packs and retention policies."],
  [ShieldIcon, "Enterprise access", "Single sign-on, automated provisioning and on-premises deployment."],
];

function Stack() {
  return (
    <ol className="planStack" aria-label="What your workspace has, and what upgrading adds">
      {STACK.map(([name, added]) => (
        <li key={name} className={added ? "is-added" : ""}>
          <span>{name}</span>
          {added ? <span className="planStack__tag">Added</span> : <CheckIcon size={15} />}
        </li>
      ))}
    </ol>
  );
}

export default function PlanPage() {
  const { role } = useWorkspaceRole();
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchWithHankoAuth(`${API_URL}/plan/usage`).then(setData).catch(() => setData({ usage: null }));
  }, []);

  const usage = data?.usage;
  const isOwner = role === "owner";

  const toggleTelemetry = async (enabled) => {
    try {
      await fetchWithHankoAuth(`${API_URL}/plan/telemetry`, { method: "PUT", body: JSON.stringify({ enabled }) });
      setData((d) => ({ ...d, telemetry: { ...d.telemetry, enabled } }));
      addToast(enabled ? "Weekly usage counts will be shared." : "Usage counts will no longer be shared.", "success");
    } catch (err) {
      addToast(err.message || "Could not change that setting.", "error");
    }
  };

  const exportWorkspace = async () => {
    setExporting(true);
    try {
      const res = await authorizedFetch(`${API_URL}/plan/export`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `The server returned ${res.status}.`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aisty-workspace-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      addToast("Workspace exported. The file contains no credentials or keys.", "success");
    } catch (err) {
      addToast(err.message || "Export failed.", "error");
    } finally {
      setExporting(false);
    }
  };

  const figures = [
    [usage?.ticketsCompleted, "tickets completed"],
    [usage?.aiActions, "actions taken by the AI"],
    [usage?.approvalsDecided, "plans approved by your team"],
    [usage?.members, usage?.members === 1 ? "person in the workspace" : "people in the workspace"],
  ];

  return (
    <div className="planPage">
      <header className="planHero">
        <div className="planHero__copy">
          <p className="planHero__eyebrow">Your plan: self-hosted workspace</p>
          <h1>Govern all the AI your company uses, not only Aisty</h1>
          <p className="planHero__lede">
            Hosted Aisty is this workspace with the rest switched on: AI tool monitoring for your team, Company Brain
            and every integration, run for you on infrastructure dedicated to your company. Upgrades start with a
            30-minute call to scope a pilot around your own workflows.
          </p>
          <div className="planHero__actions">
            <button type="button" className="btn signal large" onClick={() => openUpgrade("plan")}>
              <CalendarIcon size={16} /> Book a call
            </button>
            <span className="planHero__note">If the pilot doesn't clear your security review and finish the agreed work in 30 days, you don't pay for it.</span>
          </div>
        </div>
        <Stack />
      </header>

      <CoverageGap cta="plan-coverage" />

      <section className="planSection">
        <h2>Also in hosted Aisty</h2>
        <ul className="planAdds">
          {ADDS.map(([Icon, title, body]) => (
            <li key={title}>
              <span className="planAdds__icon"><Icon size={18} /></span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="planSection">
        <h2>Your workspace so far</h2>
        <div className="planFigures">
          {figures.map(([value, label]) => (
            <div key={label}>
              <span className="planFigures__value">{value ?? "–"}</span>
              <span className="planFigures__label">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="planSection">
        <h2>Your data</h2>
        <div className="planData">
          <div>
            <h3>Export for a hosted pilot</h3>
            <p>
              Goals, tickets, recurring tickets, team, approval policy and your audit history with its hash chain verified.
              Credentials and keys never leave this server.
            </p>
            <button type="button" className="btn secondary medium" disabled={!isOwner || exporting} onClick={exportWorkspace}>
              {exporting ? "Preparing export…" : "Export workspace"}
            </button>
            {!isOwner && <p className="planData__note">Only the workspace owner can export.</p>}
          </div>
          <div>
            <h3>Share usage counts</h3>
            <p>
              Off unless you turn it on. Once a week this deployment sends counts of members, completed tickets and AI
              actions, and which integrations are connected. Never prompts, results or names.
            </p>
            <label className="planToggle">
              <input type="checkbox" checked={Boolean(data?.telemetry?.enabled)} disabled={!data?.telemetry?.canEdit}
                onChange={(e) => toggleTelemetry(e.target.checked)} />
              <span>Share weekly usage counts with Aisty</span>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
