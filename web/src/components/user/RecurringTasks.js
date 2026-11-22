import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, useToast } from '../../ui';
import { fetchWithHankoAuth } from "../utils/verifiedCall";
import { CheckIcon, CloseIcon, RepeatIcon, StopIcon } from "../utils/Icons";
import { EditRecurrencePopup } from "./recurring/EditRecurrencePopup";
import { API_URL } from "../../config";

const PROJECT = "Aisty";

// Dedicated UI for managing recurring task templates.
function RecurringTasks({ goals = [] }) {
  const { addToast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWithHankoAuth(
        `${API_URL}/recurring-tickets?project=${PROJECT}`,
      );
      setTemplates(data?.templates || []);
    } catch (err) {
      console.error("[RecurringTasks] load failed", err);
      addToast("Failed to load recurring tasks.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const updateTemplate = useCallback(
    async (templateId, body) => {
      try {
        const data = await fetchWithHankoAuth(
          `${API_URL}/recurring-tickets/${templateId}?project=${PROJECT}`,
          { method: "PATCH", body: JSON.stringify(body) },
        );
        setTemplates((prev) =>
          prev.map((t) => (t.templateId === templateId ? data.template : t)),
        );
        return data.template;
      } catch (err) {
        console.error("[RecurringTasks] update failed", err);
        addToast(err?.message || "Failed to update.", "error");
        throw err;
      }
    },
    [addToast],
  );

  const handleTogglePause = useCallback(
    async (tpl) => {
      try {
        await updateTemplate(tpl.templateId, { enabled: !tpl.enabled });
        addToast(
          tpl.enabled ? `Paused "${tpl.title}".` : `Resumed "${tpl.title}".`,
          "success",
        );
      } catch (_) {}
    },
    [updateTemplate, addToast],
  );

  const handleStop = useCallback(
    async (tpl) => {
      if (!window.confirm(`Stop recurring task "${tpl.title}"? No new tickets will be created from this template.`)) return;
      try {
        await fetchWithHankoAuth(
          `${API_URL}/recurring-tickets/${tpl.templateId}/disable?project=${PROJECT}`,
          { method: "POST" },
        );
        addToast(`Stopped "${tpl.title}".`, "success");
        loadTemplates();
      } catch (err) {
        console.error(err);
        addToast(err?.message || "Failed to stop.", "error");
      }
    },
    [addToast, loadTemplates],
  );

  const handleDelete = useCallback(
    async (tpl) => {
      if (!window.confirm(`Delete recurring task template "${tpl.title}"? Already-created tickets keep their history; only future runs are removed.`)) return;
      try {
        await fetchWithHankoAuth(
          `${API_URL}/recurring-tickets/${tpl.templateId}?project=${PROJECT}`,
          { method: "DELETE" },
        );
        setTemplates((prev) => prev.filter((t) => t.templateId !== tpl.templateId));
        addToast(`Deleted "${tpl.title}".`, "success");
      } catch (err) {
        console.error(err);
        addToast(err?.message || "Failed to delete.", "error");
      }
    },
    [addToast],
  );

  const handleRunNow = useCallback(
    async (tpl) => {
      try {
        await fetchWithHankoAuth(
          `${API_URL}/recurring-tickets/${tpl.templateId}/run-now?project=${PROJECT}`,
          { method: "POST" },
        );
        addToast(`Spawned a ticket from "${tpl.title}".`, "success");
        loadTemplates();
      } catch (err) {
        console.error(err);
        addToast(err?.message || "Failed to spawn.", "error");
      }
    },
    [addToast, loadTemplates],
  );

  // A recurring task's plan is approved on its first run, then reused so later cycles don't ask the same question every week.
  const handleRequireApproval = useCallback(
    async (tpl) => {
      try {
        await fetchWithHankoAuth(
          `${API_URL}/recurring-tickets/${tpl.templateId}/require-approval?project=${PROJECT}`,
          { method: "POST" },
        );
        addToast(`"${tpl.title}" will ask for approval on its next run.`, "success");
        loadTemplates();
      } catch (err) {
        console.error(err);
        addToast(err?.message || "Failed to reset the approval.", "error");
      }
    },
    [addToast, loadTemplates],
  );

  const goalById = useMemo(() => {
    const map = new Map();
    (goals || []).forEach((g) => map.set(g.goalId, g));
    return map;
  }, [goals]);

  return (
    <div className="recurringTasks">
      <header className="recurringTasks__header">
        <div>
          <h3>Recurring Tasks</h3>
          <p className="secondary-text">
            Templates that automatically spawn new tickets on a schedule. Editing
            a template only affects future runs, existing tickets keep their
            history.
          </p>
        </div>
        <Button variant="secondary" onClick={loadTemplates} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : templates.length === 0 ? (
        <p className="secondary-text">
          No recurring tasks yet. Create one from any ticket card's "Make recurring" action.
        </p>
      ) : (
        <table className="recurringTasks__table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Goal</th>
              <th>Frequency</th>
              <th>Next run</th>
              <th>Runs</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => (
              <tr key={tpl.templateId} className={!tpl.enabled ? "is-paused" : ""}>
                <td className="recurringTasks__title">{tpl.title}</td>
                <td>{goalById.get(tpl.goalId)?.title || <span className="secondary-text">–</span>}</td>
                <td><code className="recurringTasks__cron">{tpl.cron}</code></td>
                <td>{formatTimestamp(tpl.nextRunAt)}</td>
                <td>{tpl.spawnCount || 0}</td>
                <td>
                  {tpl.approvedWorkflowFingerprint ? (
                    <span
                      className="recurringTasks__planApproved"
                      title={`Approved ${formatTimestamp(tpl.workflowApprovedAt)}. Later runs with the same plan go ahead without asking.`}
                    >
                      Approved
                    </span>
                  ) : (
                    <span className="secondary-text">Asks each run</span>
                  )}
                </td>
                <td>
                  <span className={`recurringTasks__status recurringTasks__status--${tpl.enabled ? "active" : "paused"}`}>
                    {tpl.enabled ? "Active" : "Paused"}
                  </span>
                </td>
                <td className="recurringTasks__actions">
                  <button
                    type="button"
                    className="recurringTasks__btn"
                    onClick={() => handleTogglePause(tpl)}
                    title={tpl.enabled ? "Pause future runs" : "Resume"}
                  >
                    {tpl.enabled ? (
                      <><StopIcon width={12} height={12} /> Pause</>
                    ) : (
                      <><CheckIcon width={14} height={14} /> Resume</>
                    )}
                  </button>
                  <button
                    type="button"
                    className="recurringTasks__btn"
                    onClick={() => setEditing(tpl)}
                    title="Modify recurrence"
                  >
                    <RepeatIcon width={14} height={14} /> Edit
                  </button>
                  <button
                    type="button"
                    className="recurringTasks__btn"
                    onClick={() => handleRunNow(tpl)}
                    title="Spawn a ticket immediately"
                  >
                    Run now
                  </button>
                  {tpl.approvedWorkflowFingerprint && (
                    <button
                      type="button"
                      className="recurringTasks__btn"
                      onClick={() => handleRequireApproval(tpl)}
                      title="Show me the plan again on the next run"
                    >
                      Re-approve
                    </button>
                  )}
                  <button
                    type="button"
                    className="recurringTasks__btn recurringTasks__btn--danger"
                    onClick={() => handleStop(tpl)}
                    title="Stop recurring entirely"
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    className="recurringTasks__btn recurringTasks__btn--danger"
                    onClick={() => handleDelete(tpl)}
                    title="Delete template"
                  >
                    <CloseIcon width={14} height={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <EditRecurrencePopup
        template={editing}
        goals={goals}
        onClose={() => setEditing(null)}
        onSubmit={async (body) => {
          await updateTemplate(editing.templateId, body);
          addToast("Recurrence updated.", "success");
          setEditing(null);
        }}
      />
    </div>
  );
}

function formatTimestamp(iso) {
  if (!iso) return "–";
  try {
    return new Date(iso).toLocaleString();
  } catch (_) {
    return iso;
  }
}

export default RecurringTasks;
