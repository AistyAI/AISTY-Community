import { useState, useEffect } from "react";
import { Popup, Button } from "../../../ui";

export const FREQUENCY_PRESETS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly (Monday)" },
  { value: "monthly", label: "Monthly (1st)" },
  { value: "quarterly", label: "Quarterly" },
  { value: "custom", label: "Custom cron…" },
];

export function EditRecurrencePopup({ template, goals, onClose, onSubmit }) {
  const [preset, setPreset] = useState("custom");
  const [cron, setCron] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [enabled, setEnabled] = useState(true);
  const [goalId, setGoalId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!template) return;
    setCron(template.cron || "");
    setTimezone(template.timezone || "UTC");
    setEnabled(template.enabled !== false);
    setGoalId(template.goalId || "");
    setPreset(detectPreset(template.cron));
  }, [template]);

  if (!template) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { timezone, enabled, goalId: goalId || null };
      if (preset === "custom") {
        if (!cron.trim()) {
          alert("Please provide a cron expression.");
          setSaving(false);
          return;
        }
        body.cron = cron.trim();
      } else {
        body.preset = preset;
      }
      await onSubmit(body);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popup show={Boolean(template)} onClose={() => !saving && onClose()}>
      <form className="recurringEditPopup" onSubmit={handleSubmit}>
        <h3>Edit recurrence: {template.title}</h3>
        <p className="secondary-text">
          Changes only affect future runs. Tickets already spawned from this template are unaffected.
        </p>

        <label className="recurringEditPopup__field">
          <span>Frequency</span>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} disabled={saving}>
            {FREQUENCY_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        {preset === "custom" && (
          <label className="recurringEditPopup__field">
            <span>Cron expression</span>
            <input
              type="text"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="0 9 * * 1"
              disabled={saving}
            />
            <small className="secondary-text">
              5-field cron (minute hour dom month dow). Example: <code>0 9 * * 1</code> = Monday 09:00.
            </small>
          </label>
        )}

        <label className="recurringEditPopup__field">
          <span>Timezone</span>
          <input
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="UTC"
            disabled={saving}
          />
        </label>

        <label className="recurringEditPopup__field">
          <span>Goal</span>
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)} disabled={saving}>
            <option value="">No goal</option>
            {(goals || []).map((g) => (
              <option key={g.goalId} value={g.goalId}>{g.title}</option>
            ))}
          </select>
        </label>

        <label className="recurringEditPopup__checkbox">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={saving}
          />
          Active (uncheck to pause without deleting)
        </label>

        <div className="recurringEditPopup__actions">
          <button type="button" className="recurringTasks__btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Popup>
  );
}

export function detectPreset(cron) {
  if (!cron) return "custom";
  // Match the backend presetToCron output exactly so the dropdown shows the right selection on existing templates.
  if (/^0 \d+ \* \* \*$/.test(cron)) return "daily";
  if (/^0 \d+ \* \* 1$/.test(cron)) return "weekly";
  if (/^0 \d+ 1 \* \*$/.test(cron)) return "monthly";
  if (/^0 \d+ 1 \*\/3 \*$/.test(cron) || /^0 \d+ 1 1,4,7,10 \*$/.test(cron)) return "quarterly";
  return "custom";
}
