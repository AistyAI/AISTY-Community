import StepTrail from "./StepTrail";
import MarkdownContent from "./MarkdownContent";
import ApprovalCard from "../approvals/ApprovalCard";
import { SpinnerIcon, TaskIcon, CheckIcon, CopyIcon, DownloadIcon, ThumbsUpIcon, ThumbsDownIcon, EditIcon } from "../utils/Icons";
import { Button } from "../../ui";

function TaskButton({ m, status, onRun }) {
  if (status === "submitting") {
    return (
      <button className="chat-task-btn chat-task-btn--loading" disabled>
        <SpinnerIcon /> Submitting…
      </button>
    );
  }
  if (status === "in_progress") {
    return (
      <button className="chat-task-btn chat-task-btn--active" disabled>
        <SpinnerIcon /> Running
      </button>
    );
  }
  if (status === "failed") {
    return (
      <button className="chat-task-btn chat-task-btn--failed" onClick={() => onRun(m)}>
        <TaskIcon /> Retry task
      </button>
    );
  }
  return (
    <button className="chat-task-btn" onClick={() => onRun(m)} title="Submit this as a workflow task">
      <TaskIcon /> Run as task
    </button>
  );
}

// The conversation: thinking state, replies with their actions, approvals and task runs.
export default function MessageList({
  copiedId,
  copyToClipboard,
  decidingApproval,
  editMessage,
  exportMessage,
  feedbackError,
  feedbackGiven,
  messages,
  resolveApproval,
  sendFeedback,
  setCorrectingId,
  setCorrectionText,
  submitAsTask,
  taskStatuses,
}) {
  return messages.map((m) => (
    <div key={m._id} className="chat-message-wrapper">
      {/* Thinking animation */}
      {m.isThinking ? (
        <div className="chat-message chat-message--assistant chat-message--thinking">
          <div className="chat-thinking-dots">
            <span /><span /><span />
          </div>
        </div>
      ) : (
        <>
          {/* What the assistant did before it answered. */}
          {m.role === "assistant" && m.steps?.length > 0 && (
            <StepTrail steps={m.steps} />
          )}
          <div className={`chat-message chat-message--${m.role}${m.isTaskNotification ? " chat-message--task" : ""}`}>
            <div className="chat-message__content">
              {m.role === "assistant" ? <MarkdownContent content={m.content} /> : (
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              )}
            </div>
          </div>
          {/* An action the agent paused on. */}
          {m.approval && (
            <div className="chat-message__approval">
              <ApprovalCard
                approval={m.approval}
                busy={decidingApproval === m.approval.approvalId}
                onDecision={(decision, note) => resolveApproval(m, decision, note)}
              />
            </div>
          )}
          <div
            className={`chat-message__actions chat-message__actions--${m.role}${
              feedbackGiven[m._id] ? " chat-message__actions--pinned" : ""
            }`}
          >
            {m.role === "assistant" && !m.isTaskNotification && !m.approval && (
              <>
                <button
                  onClick={() => copyToClipboard(m.content, m._id, m.provenance)}
                  title="Copy"
                >
                  {copiedId === m._id ? <CheckIcon /> : <CopyIcon />}
                </button>
                <button
                  onClick={() => exportMessage(m)}
                  title="Download with an AI disclosure"
                >
                  <DownloadIcon />
                </button>
                <button
                  className={`chat-feedback-btn${feedbackGiven[m._id] === "up" ? " is-active" : ""}`}
                  onClick={() => sendFeedback(m._id, "up")}
                  aria-pressed={feedbackGiven[m._id] === "up"}
                  title={feedbackGiven[m._id] === "up" ? "You marked this a good response" : "Good response"}
                >
                  <ThumbsUpIcon />
                </button>
                <button
                  className={`chat-feedback-btn chat-feedback-btn--down${feedbackGiven[m._id] === "down" ? " is-active" : ""}`}
                  onClick={() => { setCorrectingId(m._id); setCorrectionText(""); }}
                  aria-pressed={feedbackGiven[m._id] === "down"}
                  title="Bad response? Tell us the correct answer"
                >
                  <ThumbsDownIcon />
                </button>
                {!m.isTaskNotification && (
                  <TaskButton m={m} status={taskStatuses[m._id]?.status} onRun={submitAsTask} />
                )}
                {feedbackGiven[m._id] && feedbackError !== m._id && (
                  <span className="chat-feedback-note">Thanks, noted.</span>
                )}
                {feedbackError === m._id && (
                  <span className="chat-feedback-note chat-feedback-note--error">
                    Couldn't save that. Try again.
                  </span>
                )}
              </>
            )}
            {m.role === "user" && (
              <Button variant="ghost" size="xs" onClick={() => editMessage(m._id)}>
                <EditIcon />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  ));
}
