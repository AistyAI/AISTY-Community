import { fetchWithHankoAuth } from "../../utils/verifiedCall";
import { CloseIcon } from "../../utils/Icons";
import { API_URL, PROJECT, createTicketId, EMPTY_TICKET, PRIORITY_OPTIONS, FIELD_LIMITS } from "./constants";

// Create-task modal.
export default function TaskModal({ gt }) {
  const {
    addToast, goals, tickets, setTickets, setShowAddTaskForm, newTaskGoalId, setNewTaskGoalId, newTaskTitle, setNewTaskTitle, newTaskDesc, setNewTaskDesc, newTaskPriority, setNewTaskPriority, newTaskDueDate, setNewTaskDueDate, newTaskRecurrence, setNewTaskRecurrence, fetchCompany, saveChanges, submitTicketForExecution,
  } = gt;

  return (
    <div className="goalsTickets__modalOverlay" onClick={() => setShowAddTaskForm(false)}>
      <div className="goalsTickets__modal goalsTickets__modal--large goalsTickets__modal--center" onClick={(e) => e.stopPropagation()}>
        <div className="goalsTickets__modalHeader">
          <h2>Create New Task</h2>
          <button
            className="goalsTickets__modalClose"
            aria-label="Close"
            onClick={() => {
              setShowAddTaskForm(false);
              setNewTaskTitle("");
              setNewTaskDesc("");
              setNewTaskPriority("medium");
              setNewTaskDueDate("");
            }}
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>
        <div className="goalsTickets__modalBody">
          {/* The prominent "This is an AI interaction" panel that used to sit here was removed at the user's request. */}
          <div className="goalsTickets__formGroup">
            <label htmlFor="goalSelect">Associated Goal *</label>
            <select
              id="goalSelect"
              className="goalsTickets__formSelect"
              value={newTaskGoalId || ""}
              onChange={(e) => setNewTaskGoalId(e.target.value)}
            >
              <option value="">-- Select a goal --</option>
              {goals.map((goal) => (
                <option key={goal.goalId} value={goal.goalId}>
                  {goal.title || "Untitled Goal"}
                </option>
              ))}
            </select>
            {!newTaskGoalId && (
              <p className="goalsTickets__formError">Please select a goal</p>
            )}
          </div>

          <div className="goalsTickets__formGroup">
            <label htmlFor="taskTitle">Task Title *</label>
            <input
              id="taskTitle"
              type="text"
              className="goalsTickets__formInput"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              maxLength={FIELD_LIMITS.ticketTitle}
              placeholder="e.g., Implement user authentication"
            />
            {!newTaskTitle && newTaskGoalId && (
              <p className="goalsTickets__formError">Task title is required</p>
            )}
          </div>

          <div className="goalsTickets__formGroup">
            <label htmlFor="taskDesc">Task Description</label>
            <textarea
              id="taskDesc"
              className="goalsTickets__formTextarea"
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              maxLength={FIELD_LIMITS.ticketDescription}
              placeholder="Add detailed description (optional)"
              rows="5"
            />
          </div>
          <div className="goalsTickets__formGroup goalsTickets__formRow">
            <div className="goalsTickets__formGroup goalsTickets__formCol">
              <label htmlFor="taskPriority">Priority</label>
              <select
                id="taskPriority"
                className="goalsTickets__formSelect"
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value)}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="goalsTickets__formGroup goalsTickets__formCol">
              <label htmlFor="taskDueDate">Due date</label>
              <input
                id="taskDueDate"
                type="date"
                className="goalsTickets__formInput"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
                disabled={newTaskRecurrence !== "none"}
              />
            </div>
          </div>

          <div className="goalsTickets__formGroup">
            <label htmlFor="taskRecurrence">Repeat</label>
            <select
              id="taskRecurrence"
              className="goalsTickets__formSelect"
              value={newTaskRecurrence}
              onChange={(e) => setNewTaskRecurrence(e.target.value)}
            >
              <option value="none">Don't repeat (one-off task)</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (every Monday)</option>
              <option value="monthly">Monthly (1st of month)</option>
              <option value="quarterly">Quarterly (1st of Jan/Apr/Jul/Oct)</option>
              <option value="yearly">Yearly (1st January)</option>
            </select>
            {newTaskRecurrence !== "none" && (
              <p className="goalsTickets__formHint">
                A new ticket will be created on each cycle. Title gets the date appended (e.g. "[TASK] {newTaskTitle || "…"} - DD/MM/YYYY"). You can stop the recurrence later from any spawned ticket.
              </p>
            )}
          </div>
        </div>
        <div className="goalsTickets__modalFooter">
          <p className="goalsTickets__aiNoticeFooter">
            {newTaskRecurrence === "none"
              ? "Creating this task starts the AI agent immediately."
              : "Each cycle starts the AI agent automatically, without a further approval step."}
            {" "}
            {/* Mirrors the chat composer's disclaimer (chat-disclaimer in chat/composer.css) so the same caveat reaches users who create work from the board and never open chat. */}
            <span className="goalsTickets__aiNoticeFooterCaveat">
              Aisty AI can make mistakes. Consider checking important information.
            </span>
          </p>
          <button
            className="goalsTickets__modalCancelBtn"
            onClick={() => {
              setShowAddTaskForm(false);
              setNewTaskTitle("");
              setNewTaskDesc("");
              setNewTaskPriority("medium");
              setNewTaskDueDate("");
            }}
          >
            Cancel
          </button>
          <button
            className="goalsTickets__modalCreateBtn"
            onClick={async () => {
              if (!newTaskGoalId || !newTaskTitle.trim()) return;

              const closeModal = () => {
                setShowAddTaskForm(false);
                setNewTaskTitle("");
                setNewTaskDesc("");
                setNewTaskPriority("medium");
                setNewTaskDueDate("");
                setNewTaskRecurrence("none");
                setNewTaskGoalId(null);
              };

              // Recurring path: create a template on the backend, which also spawns the first ticket immediately so the user sees one in the board straight away.
              if (newTaskRecurrence !== "none") {
                try {
                  const created = await fetchWithHankoAuth(
                    `${API_URL}/recurring-tickets?project=${PROJECT}`,
                    {
                      method: "POST",
                      body: JSON.stringify({
                        title: newTaskTitle.trim(),
                        description: newTaskDesc,
                        priority: newTaskPriority,
                        goalId: newTaskGoalId,
                        preset: newTaskRecurrence,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                      }),
                    }
                  );
                  // Spawn the first instance now so the user can see it
                  await fetchWithHankoAuth(
                    `${API_URL}/recurring-tickets/${created.template.templateId}/run-now?project=${PROJECT}`,
                    { method: "POST" }
                  );
                  addToast(
                    `Recurring task created (${newTaskRecurrence}). First ticket has been queued.`,
                    "success"
                  );
                  closeModal();
                  // Refresh from server so the new spawned ticket appears
                  fetchCompany();
                } catch (err) {
                  console.error("[GoalsAndTickets] Recurring create failed:", err);
                  addToast(`Failed to create recurring task: ${err.message || err}`, "error");
                }
                return;
              }

              // One-off task: original behavior
              const newTicket = {
                ...EMPTY_TICKET,
                ticketId: createTicketId(),
                goalId: newTaskGoalId,
                title: newTaskTitle,
                description: newTaskDesc,
                priority: newTaskPriority,
                dueDate: newTaskDueDate ? new Date(newTaskDueDate).toISOString() : null,
                status: "in_progress",
                approved: true,
                execution: { status: "in_progress" },
              };
              const updated = [...tickets, newTicket];
              setTickets(updated);
              closeModal();
              addToast("Task created. The AI is now working on it.", "success");
              try {
                await saveChanges(updated);
              } catch (err) {
                console.error("[GoalsAndTickets] Save before submit failed:", err);
              }
              submitTicketForExecution(newTicket);
            }}
            disabled={!newTaskGoalId || !newTaskTitle.trim()}
          >
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}
