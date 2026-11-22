import { CloseIcon } from "../../utils/Icons";
import { FIELD_LIMITS, BOARD_COLUMNS } from "./constants";

// Kanban view: status columns across all goals.
export default function KanbanBoard({ gt }) {
  const {
    goals, setShowAddTaskForm, setNewTaskGoalId, handleGoalChange, addGoal, removeGoal, removeTicket, getTicketsForGoal, getShortId, getTicketsForColumn, openTicketDetails,
  } = gt;

  return (
    <div className="goalsTickets__board goalsTickets__board--kanban">
      <div className="goalsTickets__kanbanBoard">
        {BOARD_COLUMNS.map((column) => {
          const columnTickets = getTicketsForColumn(column.value);
          return (
            <div
              className="goalsTickets__kanbanColumn"
              key={`kanban-col-${column.value}`}
            >
              {/* Column Header */}
              <div
                className="goalsTickets__kanbanColumnHeader"
                style={{ borderBottomColor: column.color }}
              >
                <span className="goalsTickets__kanbanColumnLabel">{column.label}</span>
                <span className="goalsTickets__kanbanColumnCount">{columnTickets.length}</span>
              </div>

              {/* Column Body: Cards */}
              <div className="goalsTickets__kanbanColumnBody">
                {columnTickets.length === 0 ? (
                  <p className="goalsTickets__kanbanEmpty">No tasks yet</p>
                ) : (
                  columnTickets.map((ticket) => {
                    const goal = goals.find((g) => g.goalId === ticket.goalId);
                    return (
                      <div
                        className="goalsTickets__kanbanCard"
                        key={`kanban-card-${ticket.ticketId}`}
                        onClick={() => openTicketDetails(ticket.ticketId)}
                      >
                        {/* Hover Menu */}
                        <div className="goalsTickets__kanbanCardMenu">
                          <button
                            className="goalsTickets__kanbanMenuBtn"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTicket(ticket.ticketId);
                            }}
                            title="Delete task"
                          >
                            <CloseIcon width={14} height={14} />
                          </button>
                        </div>

                        {/* Card ID */}
                        <span className="goalsTickets__kanbanCardId">{getShortId(ticket.ticketId)}</span>

                        {/* Card Title */}
                        <div className="goalsTickets__kanbanCardContent">
                          <span className="goalsTickets__kanbanCardTitle">
                            {ticket.title || "Untitled task"}
                          </span>
                        </div>

                        {/* Card Footer */}
                        <div className="goalsTickets__kanbanCardFooter">
                          <div className="goalsTickets__kanbanCardFooterLeft">
                            {goal && (
                              <span className="goalsTickets__kanbanCardGoal">{goal.title}</span>
                            )}
                            {ticket.aiGenerated && (
                              <span
                                className="aiOriginChip"
                                title={
                                  ticket.aiOrigin === "ai-suggestion"
                                    ? "This task was suggested by the AI, not written by a person"
                                    : "This task originated from the AI"
                                }
                              >
                                AI
                              </span>
                            )}
                          </div>
                          <div className="goalsTickets__kanbanCardFooterRight">
                            {/* Held plans need to be findable from the board, a task nobody notices is waiting is a task that never runs. */}
                            {ticket.pendingApproval?.approvalId && (
                              <span
                                className="goalsTickets__kanbanHeldBadge"
                                title="The AI planned this task and is waiting for your approval"
                              >
                                Needs you
                              </span>
                            )}
                            {/* The approved tick was removed with the status dot above it. */}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Add Task to Column Button */}
                <button
                  className="goalsTickets__kanbanAddBtn"
                  onClick={() => {
                    setShowAddTaskForm(true);
                    setNewTaskGoalId(goals.length > 0 ? goals[0].goalId : null);
                  }}
                >
                  + Add task
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show Goals Section */}
      {goals.length > 0 && (
        <div className="goalsTickets__goalsSection">
          <div className="goalsTickets__goalsSectionHeader">
            <h2>Active Goals</h2>
            <p className="goalsTickets__goalsSectionSubtitle">Manage your strategic goals and track progress</p>
          </div>
          <div className="goalsTickets__goalsList">
            {goals.map((goal) => {
              const goalTickets = getTicketsForGoal(goal.goalId);
              const completedTickets = goalTickets.filter((t) => t.status === "completed").length;
              const approvedTickets = goalTickets.filter((t) => t.approved).length;
              
              return (
                <div className="goalsTickets__goalCard" key={goal.goalId}>
                  <div className="goalsTickets__goalCardHeader">
                    <div className="goalsTickets__goalCardInfo">
                      <input
                        type="text"
                        className="goalsTickets__goalCardTitle"
                        value={goal.title}
                        onChange={(e) => handleGoalChange(goal.goalId, "title", e.target.value)} maxLength={FIELD_LIMITS.goalTitle}
                        placeholder="Goal title"
                      />
                      <p className="goalsTickets__goalCardMeta">
                        {goalTickets.length} task{goalTickets.length !== 1 ? "s" : ""} · 
                        {approvedTickets} approved · 
                        {completedTickets} completed
                      </p>
                    </div>
                    <button
                      className="goalsTickets__goalCardDelete"
                      onClick={() => removeGoal(goal.goalId)}
                      title="Remove goal"
                    >
                      <CloseIcon width={14} height={14} />
                    </button>
                  </div>
                  <textarea
                    className="goalsTickets__goalCardDesc"
                    value={goal.description}
                    onChange={(e) => handleGoalChange(goal.goalId, "description", e.target.value)} maxLength={FIELD_LIMITS.goalDescription}
                    placeholder="Goal description"
                  />
                  <input
                    type="text"
                    className="goalsTickets__goalCardTarget"
                    value={goal.target}
                    onChange={(e) => handleGoalChange(goal.goalId, "target", e.target.value)} maxLength={FIELD_LIMITS.goalTarget}
                    placeholder="Target (e.g., Grow MRR to $20k by Q4)"
                  />
                </div>
              );
            })}
          </div>
          <button className="goalsTickets__addGoalBtn" onClick={addGoal}>
            + Add Goal
          </button>
        </div>
      )}

      {goals.length === 0 && (
        <div className="goalsTickets__emptyState">
          <div className="goalsTickets__emptyStateContent">
            <h3>No goals yet</h3>
            <p>Create your first goal to get started with strategic planning</p>
            <button className="goalsTickets__emptyStateBtn" onClick={addGoal}>
              Create First Goal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
