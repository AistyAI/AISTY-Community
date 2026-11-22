import { CheckIcon, CloseIcon, RepeatIcon, StopIcon } from "../../utils/Icons";
import { PRIORITY_OPTIONS, FIELD_LIMITS, BOARD_COLUMNS, formatStatusValue } from "./constants";
import { AiResponseBlock, AttachmentLink } from "./TicketParts";
import { LockedPanel } from "../../free/LockedFeature";
import ApprovalCard from "../../approvals/ApprovalCard";

// Ticket detail panel.
export default function TicketDetails({ gt }) {
  const {
    goals, tickets, handleTicketChange, removeTicket, cancelTicketExecution, stopRecurring, getShortId, selectedTicketId, ticketComments, newComment, setNewComment, planCards, decidingPlan, decidePlan, handleApprove, addComment, closeTicketDetails,
  } = gt;

  return (
    <div className="goalsTickets__modalOverlay" onClick={closeTicketDetails}>
      <div className="goalsTickets__modal goalsTickets__modal--large" onClick={(e) => e.stopPropagation()}>
        {(() => {
          const ticket = tickets.find((t) => t.ticketId === selectedTicketId);
          if (!ticket) {
            return (
              <div className="goalsTickets__modalBody">
                <p>Ticket not found.</p>
              </div>
            );
          }

          const goal = goals.find((g) => g.goalId === ticket.goalId);
          const columnDef = BOARD_COLUMNS.find((c) => c.value === ticket.status);

          return (
            <>
              <div className="goalsTickets__modalHeader">
                <div className="goalsTickets__modalHeaderMeta">
                  <span className="goalsTickets__kanbanCardId">{getShortId(ticket.ticketId)}</span>
                  {columnDef && (
                    <span
                      className="goalsTickets__statusPill"
                      style={{ "--pill-color": columnDef.color }}
                    >
                      {columnDef.label}
                    </span>
                  )}
                </div>
                <button
                  className="goalsTickets__modalClose"
                  aria-label="Close"
                  onClick={closeTicketDetails}
                >
                  <CloseIcon width={14} height={14} />
                </button>
              </div>

              <div className="goalsTickets__modalBody">
                {/* Title - editable */}
                <div className="goalsTickets__formGroup">
                  <label className="goalsTickets__srOnly" htmlFor="ticketTitle">Title</label>
                  <input
                    id="ticketTitle"
                    type="text"
                    className="goalsTickets__formInput goalsTickets__titleInput"
                    maxLength={FIELD_LIMITS.ticketTitle}
                    value={ticket.title}
                    onChange={(event) =>
                      handleTicketChange(ticket.ticketId, "title", event.target.value)
                    }
                  />
                </div>

                {/* The AI has planned this task but has not run any of it. */}
                {ticket.pendingApproval?.approvalId && (
                  <div className="goalsTickets__detailSection">
                    {planCards[ticket.pendingApproval.approvalId] ? (
                      <ApprovalCard
                        approval={planCards[ticket.pendingApproval.approvalId]}
                        busy={decidingPlan === ticket.pendingApproval.approvalId}
                        onDecision={(decision, note) => decidePlan(ticket, decision, note)}
                      />
                    ) : (
                      <p className="goalsTickets__detailValue">Loading the plan…</p>
                    )}
                  </div>
                )}

                {/* Details Section. */}
                <div className="goalsTickets__detailSection">
                  <h4 className="goalsTickets__detailSectionTitle">Details</h4>
                  <div className="goalsTickets__detailGrid">
                    <div className="goalsTickets__detailRow">
                      <label className="goalsTickets__detailLabel" htmlFor="ticketStatus">Status</label>
                      <select
                        id="ticketStatus"
                        className="goalsTickets__formSelect goalsTickets__detailControl"
                        value={ticket.status}
                        onChange={(event) =>
                          handleTicketChange(ticket.ticketId, "status", event.target.value)
                        }
                      >
                        {BOARD_COLUMNS.map((col) => (
                          <option key={col.value} value={col.value}>
                            {col.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {goal && (
                      <div className="goalsTickets__detailRow">
                        <span className="goalsTickets__detailLabel">Goal</span>
                        <span className="goalsTickets__detailValue">{goal.title}</span>
                      </div>
                    )}
                    {ticket.execution?.status && (
                      <div className="goalsTickets__detailRow">
                        <span className="goalsTickets__detailLabel">Execution</span>
                        <span className="goalsTickets__detailValue">
                          <span
                            className={`goalsTickets__execPill goalsTickets__execPill--${ticket.execution.status}`}
                          >
                            {formatStatusValue(ticket.execution.status)}
                          </span>
                        </span>
                      </div>
                    )}
                    <div className="goalsTickets__detailRow">
                      <label className="goalsTickets__detailLabel" htmlFor="ticketPriority">Priority</label>
                      <select
                        id="ticketPriority"
                        className="goalsTickets__formSelect goalsTickets__detailControl goalsTickets__prioritySelect"
                        value={ticket.priority || "medium"}
                        onChange={(event) =>
                          handleTicketChange(ticket.ticketId, "priority", event.target.value)
                        }
                        style={{
                          "--priority-color":
                            PRIORITY_OPTIONS.find((p) => p.value === (ticket.priority || "medium"))?.color,
                        }}
                      >
                        {PRIORITY_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="goalsTickets__detailRow">
                      <label className="goalsTickets__detailLabel" htmlFor="ticketDueDate">Due date</label>
                      <input
                        id="ticketDueDate"
                        type="date"
                        className="goalsTickets__formInput goalsTickets__detailControl"
                        value={ticket.dueDate ? new Date(ticket.dueDate).toISOString().split("T")[0] : ""}
                        onChange={(event) =>
                          handleTicketChange(
                            ticket.ticketId,
                            "dueDate",
                            event.target.value ? new Date(event.target.value).toISOString() : null
                          )
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Description Section */}
                <div className="goalsTickets__detailSection">
                  <h4 className="goalsTickets__detailSectionTitle">Description</h4>
                  <textarea
                    className="goalsTickets__formTextarea"
                    maxLength={FIELD_LIMITS.ticketDescription}
                    value={ticket.description}
                    onChange={(event) =>
                      handleTicketChange(ticket.ticketId, "description", event.target.value)
                    }
                    rows="4"
                    placeholder="Add a description..."
                  />
                </div>

                {ticket.recurringTemplateId && (
                  <div className="goalsTickets__detailSection">
                    <h4 className="goalsTickets__detailSectionTitle">Recurring schedule</h4>
                    <p className="goalsTickets__detailNote">
                      This ticket was created automatically by a recurring schedule. New tickets will continue to be created on each cycle until you stop it.
                    </p>
                    <button
                      className="goalsTickets__modalCancelBtn"
                      onClick={() => stopRecurring(ticket.recurringTemplateId)}
                    >
                      <RepeatIcon width={14} height={14} /> Stop creating future tickets
                    </button>
                  </div>
                )}

                {/* AI Response Section */}
                {ticket.responses?.length > 0 && (
                  <div className="goalsTickets__detailSection">
                    <h4 className="goalsTickets__detailSectionTitle">AI Response</h4>
                    {ticket.responses.map((resp, idx) => (
                      <AiResponseBlock key={idx} response={resp} ticketTitle={ticket.title} />
                    ))}
                    {ticket.knowledgeGap && (
                      <LockedPanel feature="company-brain" />
                    )}
                  </div>
                )}

                {/* Attachments */}
                {ticket.attachments?.length > 0 && (
                  <div className="goalsTickets__detailSection">
                    <h4 className="goalsTickets__detailSectionTitle">Attachments</h4>
                    <p className="goalsTickets__credentialNote goalsTickets__credentialNote--faint">
                      AI-generated. Each file carries a content credential, embedded in the
                      file where the format allows comments, and always as a{" "}
                      <code>.c2pa.json</code> sidecar alongside it.
                    </p>
                    <div className="goalsTickets__attachmentsList">
                      {ticket.attachments.map((att, idx) => (
                        <AttachmentLink key={idx} attachment={att} index={idx} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments Section */}
                <div className="goalsTickets__detailSection">
                  <h4 className="goalsTickets__detailSectionTitle">Comments</h4>
                  <div className="goalsTickets__commentsList">
                    {(ticketComments[ticket.ticketId] || []).length === 0 ? (
                      <p className="goalsTickets__noComments">No comments yet</p>
                    ) : (
                      (ticketComments[ticket.ticketId] || []).map((comment) => (
                        <div key={comment.commentId} className="goalsTickets__comment">
                          <p className="goalsTickets__commentText">{comment.text}</p>
                          <span className="goalsTickets__commentDate">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="goalsTickets__addComment">
                    <textarea
                      className="goalsTickets__commentInput"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      maxLength={FIELD_LIMITS.ticketComment}
                      placeholder="Add a comment..."
                      rows="2"
                    />
                    <button
                      className="goalsTickets__addCommentBtn"
                      onClick={() => addComment(ticket.ticketId)}
                      disabled={!newComment.trim()}
                    >
                      Add Comment
                    </button>
                  </div>
                </div>
              </div>

              {/* Panel Footer with Actions */}
              <div className="goalsTickets__modalFooter">
                {ticket.status === "open" && !ticket.approved && (
                  <button
                    className="goalsTickets__modalCreateBtn"
                    onClick={() => handleApprove(ticket.ticketId)}
                  >
                    <CheckIcon width={14} height={14} /> Approve
                  </button>
                )}
                {(ticket.status === "in_progress" || ticket.execution?.status === "in_progress") && (
                  <button
                    className="goalsTickets__modalCancelBtn"
                    onClick={() => cancelTicketExecution(ticket.ticketId)}
                  >
                    <StopIcon width={12} height={12} /> Stop
                  </button>
                )}
                <button
                  className="goalsTickets__modalCancelBtn goalsTickets__modalDangerBtn"
                  onClick={() => {
                    removeTicket(ticket.ticketId);
                    closeTicketDetails();
                  }}
                >
                  Delete
                </button>
                <button
                  className="goalsTickets__modalCancelBtn"
                  onClick={closeTicketDetails}
                >
                  Close
                </button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
