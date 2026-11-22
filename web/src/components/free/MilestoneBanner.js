import React, { useState } from "react";
import { useWorkspaceRole } from "../utils/WorkspaceRoleContext";
import { MILESTONE_TICKETS, openUpgrade } from "../../edition";
import "./free.css";

const KEY = "aisty_free_milestone_dismissed";

/** Shown once, when a workspace has completed enough work to want more. */
export default function MilestoneBanner() {
  const { companyData } = useWorkspaceRole();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  const completed = (companyData?.tickets || []).filter((t) => t.status === "completed").length;
  if (dismissed || completed < MILESTONE_TICKETS) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(KEY, "1"); } catch { /* private window */ }
  };

  return (
    <div className="milestoneBanner" role="status">
      <span><b>{completed} tickets done, every one on the record.</b> The AI tools your team uses outside Aisty aren't. See what hosted Aisty adds.</span>
      <button type="button" className="milestoneBanner__cta" onClick={() => openUpgrade("milestone")}>Book a call</button>
      <button type="button" className="milestoneBanner__close" aria-label="Dismiss" onClick={dismiss}>×</button>
    </div>
  );
}
