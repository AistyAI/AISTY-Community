import { useState, useEffect } from "react";
import { toDateInput, PROJECT, API_URL, formatDay } from "./format";
import { Popup, Button } from "../../../ui";
import { UpgradeNudge } from "../../free/LockedFeature";
import { hanko } from "../../../hanko";

export function ExtractPopup({ open, onClose, onConfirm, minDate, days }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (open) {
      // Default to the last 30 days.
      const today = new Date();
      const thirtyAgo = new Date(today);
      thirtyAgo.setDate(today.getDate() - 30);
      const start = toDateInput(thirtyAgo);
      setFrom(minDate && start < minDate ? minDate : start);
      setTo(toDateInput(today));
    }
  }, [open, minDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!from || !to) return;
    if (new Date(from) > new Date(to)) {
      alert("'From' date must not be after 'to' date.");
      return;
    }
    setWorking(true);
    try {
      await onConfirm(from, to);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Popup show={open} onClose={() => !working && onClose()}>
      <form className="auditExtractPopup" onSubmit={handleSubmit}>
        <h3>Extract audit logs</h3>
        <p className="secondary-text">
          Choose the period you want to export. The result is a CSV download.
        </p>
        <UpgradeNudge cta="audit-export-history">
          Exports cover the last {days} days. Full-history exports and auditor evidence packs come with hosted Aisty.
        </UpgradeNudge>

        <label className="auditExtractPopup__field">
          <span>From</span>
          <input type="date" value={from} min={minDate || undefined} onChange={(e) => setFrom(e.target.value)} required disabled={working} />
        </label>
        <label className="auditExtractPopup__field">
          <span>To</span>
          <input type="date" value={to} min={minDate || undefined} onChange={(e) => setTo(e.target.value)} required disabled={working} />
        </label>

        <div className="auditExtractPopup__actions">
          <button type="button" className="auditTrail__pageBtn" onClick={onClose} disabled={working}>
            Cancel
          </button>
          <Button type="submit" variant="primary" disabled={working || !from || !to}>
            {working ? "Preparing…" : "Download CSV"}
          </Button>
        </div>
      </form>
    </Popup>
  );
}

export async function downloadExport(from, to, addToast) {
  try {
    // We can't use fetchWithHankoAuth because the response is a binary stream; mirror its auth-header pattern with a raw fetch + blob download.
    const token = await hanko.getSessionToken();
    const params = new URLSearchParams({ project: PROJECT, from, to });
    const resp = await fetch(`${API_URL}/audit/export?${params.toString()}`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || `HTTP ${resp.status}`);
    }
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${from}_to_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    const windowStart = resp.headers.get("X-Aisty-Audit-Window-Start");
    addToast?.(
      windowStart
        ? `Audit log downloaded from ${formatDay(windowStart)}, the start of the 90-day window.`
        : "Audit log downloaded.",
      "success",
    );
  } catch (err) {
    console.error("[AuditTrail] export failed", err);
    addToast?.(err?.message || "Export failed.", "error");
  }
}
