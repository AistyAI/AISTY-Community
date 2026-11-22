import { Button } from "../../../ui";
import { CheckIcon, CloseIcon, RepeatIcon, StopIcon, PriorityDot, ChevronDownIcon } from "../../utils/Icons";
import { PRIORITY_OPTIONS, FIELD_LIMITS, BOARD_COLUMNS } from "./constants";

// List view: tickets grouped by goal.
export default function ListBoard({ gt }) {
  const {
    goals, setShowAddTaskForm, setNewTaskGoalId, collapsedGoals, setCollapsedGoals, handleGoalChange, handleTicketChange, addGoal, removeGoal, removeTicket, cancelTicketExecution, stopRecurring, getTicketsForGoal, handleApprove, openTicketDetails,
  } = gt;

  return (
    <div className="goalsTickets__board goalsTickets__board--list goalsTickets__listV2">
      {goals.length === 0 ? (
        <p className="goalsTickets__empty">
          No goals yet.{" "}
          <Button variant="secondary" onClick={addGoal}>
            Add your first goal
          </Button>
        </p>
      ) : (
        goals.map((goal, goalIdx) => {
          const goalsTickets = getTicketsForGoal(goal.goalId);
          // Deterministic group colour from the palette so each goal is visually distinct.
          const GROUP_COLORS = [
            "var(--accent-color)",      // teal
            "var(--primary-color)",     // brand orange
            "#3b82f6",                  // blue
            "#a855f7",                  // purple
            "#ef4444",                  // red
            "#10b981",                  // green
            "#f59e0b",                  // amber
            "#06b6d4",                  // cyan
          ];
          const groupColor = GROUP_COLORS[goalIdx % GROUP_COLORS.length];
          const isCollapsed = collapsedGoals[goal.goalId];

          return (
            <section
              className="goalsTickets__listGroup"
              key={`listgroup-${goal.goalId}`}
              style={{ "--group-color": groupColor }}
            >
              {/* Group header: chevron + goal title (Monday-style) */}
              <header className="goalsTickets__listGroupHeader">
                <button
                  type="button"
                  className={`goalsTickets__listGroupChevron ${isCollapsed ? "is-collapsed" : ""}`}
                  onClick={() => setCollapsedGoals((prev) => ({ ...prev, [goal.goalId]: !prev[goal.goalId] }))}
                  title={isCollapsed ? "Expand" : "Collapse"}
                >
                  <ChevronDownIcon width={16} height={16} />
                </button>
                <input
                  type="text"
                  className="goalsTickets__listGroupTitle"
                  value={goal.title}
                  onChange={(e) => handleGoalChange(goal.goalId, "title", e.target.value)} maxLength={FIELD_LIMITS.goalTitle}
                  placeholder="Goal title"
                />
                <span className="goalsTickets__listGroupCount">
                  {goalsTickets.length} task{goalsTickets.length !== 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  className="goalsTickets__listGroupRemove"
                  onClick={() => removeGoal(goal.goalId)}
                  title="Remove this goal"
                >
                  <CloseIcon width={14} height={14} />
                </button>
              </header>

              {!isCollapsed && (
                <div className="goalsTickets__listTableWrap">
                  <div className="goalsTickets__listTable" role="table" aria-label={goal.title || "Goal tickets"}>
                    <div className="goalsTickets__listRow goalsTickets__listRow--head" role="row">
                      <div className="goalsTickets__listCell goalsTickets__listCell--bar" aria-hidden="true" />
                      <div className="goalsTickets__listCell goalsTickets__listCell--title" role="columnheader">Task</div>
                      <div className="goalsTickets__listCell goalsTickets__listCell--meta" role="columnheader">Created</div>
                      <div className="goalsTickets__listCell goalsTickets__listCell--desc" role="columnheader">Description</div>
                      <div className="goalsTickets__listCell goalsTickets__listCell--due" role="columnheader">Due</div>
                      <div className="goalsTickets__listCell goalsTickets__listCell--status" role="columnheader">Status</div>
                      <div className="goalsTickets__listCell goalsTickets__listCell--priority" role="columnheader">Priority</div>
                      <div className="goalsTickets__listCell goalsTickets__listCell--repeat" role="columnheader">Repeat</div>
                      <div className="goalsTickets__listCell goalsTickets__listCell--actions" role="columnheader" aria-label="Actions" />
                    </div>

                    {goalsTickets.length === 0 && (
                      <div className="goalsTickets__listRow goalsTickets__listRow--empty" role="row">
                        <div className="goalsTickets__listCell goalsTickets__listCell--bar" />
                        <div className="goalsTickets__listEmptyMsg">No tasks yet. Click + Add task below.</div>
                      </div>
                    )}

                    {goalsTickets.map((ticket) => {
                      const statusDef = BOARD_COLUMNS.find((c) => c.value === ticket.status) || BOARD_COLUMNS[0];
                      const priorityDef = PRIORITY_OPTIONS.find((p) => p.value === (ticket.priority || "medium"));
                      const isOverdue =
                        ticket.dueDate &&
                        ["open", "approved", "in_progress"].includes(ticket.status) &&
                        new Date(ticket.dueDate) < new Date();
                      return (
                        <div
                          className="goalsTickets__listRow"
                          role="row"
                          key={`listrow-${ticket.ticketId}`}
                          onClick={() => openTicketDetails(ticket.ticketId)}
                        >
                          <div
                            className="goalsTickets__listCell goalsTickets__listCell--bar"
                            style={{ background: statusDef.color }}
                            aria-hidden="true"
                          />
                          <div
                            className="goalsTickets__listCell goalsTickets__listCell--title"
                            role="cell"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              className="goalsTickets__listTitleInput"
                              value={ticket.title}
                              onChange={(e) => handleTicketChange(ticket.ticketId, "title", e.target.value)} maxLength={FIELD_LIMITS.ticketTitle}
                              placeholder="Task title"
                            />
                            {ticket.aiGenerated && (
                              <span className="aiOriginChip" title="This task originated from the AI">
                                AI
                              </span>
                            )}
                          </div>
                          <div className="goalsTickets__listCell goalsTickets__listCell--meta" role="cell">
                            <span className="goalsTickets__listMetaText">
                              {ticket.approvedAt
                                ? new Date(ticket.approvedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                                : "–"}
                            </span>
                          </div>
                          <div
                            className="goalsTickets__listCell goalsTickets__listCell--desc"
                            role="cell"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              className="goalsTickets__listDescInput"
                              value={ticket.description}
                              onChange={(e) => handleTicketChange(ticket.ticketId, "description", e.target.value)} maxLength={FIELD_LIMITS.ticketDescription}
                              placeholder="Add a description…"
                            />
                          </div>
                          <div
                            className={`goalsTickets__listCell goalsTickets__listCell--due ${isOverdue ? "is-overdue" : ""}`}
                            role="cell"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isOverdue && <span className="goalsTickets__dueDot" title="Overdue"><PriorityDot color="#ef4444" size={8} /></span>}
                            <input
                              type="date"
                              className="goalsTickets__listDateInput"
                              value={ticket.dueDate ? new Date(ticket.dueDate).toISOString().split("T")[0] : ""}
                              onChange={(e) =>
                                handleTicketChange(
                                  ticket.ticketId,
                                  "dueDate",
                                  e.target.value ? new Date(e.target.value).toISOString() : null
                                )
                              }
                            />
                          </div>
                          <div
                            className="goalsTickets__listCell goalsTickets__listCell--status"
                            role="cell"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              className="goalsTickets__listStatusPill"
                              value={ticket.status}
                              onChange={(e) => handleTicketChange(ticket.ticketId, "status", e.target.value)}
                              style={{ background: statusDef.color, color: "#fff" }}
                            >
                              {BOARD_COLUMNS.map((col) => (
                                <option key={col.value} value={col.value} style={{ background: "#fff", color: "#0f172a" }}>
                                  {col.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div
                            className="goalsTickets__listCell goalsTickets__listCell--priority"
                            role="cell"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              className="goalsTickets__listPriorityPill"
                              value={ticket.priority || "medium"}
                              onChange={(e) => handleTicketChange(ticket.ticketId, "priority", e.target.value)}
                              style={{ background: priorityDef?.color || "#3b82f6", color: "#fff" }}
                            >
                              {PRIORITY_OPTIONS.map((p) => (
                                <option key={p.value} value={p.value} style={{ background: "#fff", color: "#0f172a" }}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="goalsTickets__listCell goalsTickets__listCell--repeat" role="cell">
                            {ticket.recurringTemplateId ? (
                              <button
                                className="goalsTickets__listRepeatBadge"
                                onClick={(e) => { e.stopPropagation(); stopRecurring(ticket.recurringTemplateId); }}
                                title="Stop recurring schedule"
                              >
                                <RepeatIcon width={14} height={14} /> Stop
                              </button>
                            ) : (
                              <span className="goalsTickets__listMetaText goalsTickets__listMetaText--faint">–</span>
                            )}
                          </div>
                          <div
                            className="goalsTickets__listCell goalsTickets__listCell--actions"
                            role="cell"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {ticket.status === "open" && !ticket.approved && (
                              <button
                                className="goalsTickets__listIconBtn goalsTickets__listIconBtn--approve"
                                onClick={() => handleApprove(ticket.ticketId)}
                                title="Approve"
                              >
                                <CheckIcon width={14} height={14} />
                              </button>
                            )}
                            {(ticket.status === "in_progress" || ticket.execution?.status === "in_progress") && (
                              <button
                                className="goalsTickets__listIconBtn goalsTickets__listIconBtn--stop"
                                onClick={() => cancelTicketExecution(ticket.ticketId)}
                                title="Stop execution"
                              >
                                <StopIcon width={12} height={12} />
                              </button>
                            )}
                            <button
                              className="goalsTickets__listIconBtn goalsTickets__listIconBtn--remove"
                              onClick={() => removeTicket(ticket.ticketId)}
                              title="Delete task"
                            >
                              <CloseIcon width={14} height={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Add row */}
                    <div className="goalsTickets__listRow goalsTickets__listRow--add" role="row">
                      <div className="goalsTickets__listCell goalsTickets__listCell--bar" />
                      <button
                        className="goalsTickets__listAddBtn"
                        onClick={() => {
                          setNewTaskGoalId(goal.goalId);
                          setShowAddTaskForm(true);
                        }}
                      >
                        + Add task
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
