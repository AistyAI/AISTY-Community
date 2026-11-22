import React, { useState } from "react";

// The tools the assistant used to produce a message.

const STATUS_LABEL = {
  ok: "done",
  error: "failed",
  declined: "you declined this",
  revised: "you asked for changes",
};

function StepIcon({ status }) {
  if (status === "error") {
    return (
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.5v4.2M8 11.2v.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "declined" || status === "revised") {
    return (
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.2 8h5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.8 8.3l2.1 2.1 4.3-4.6" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Step({ step }) {
  const [open, setOpen] = useState(false);
  const status = step.status || "ok";
  const hasDetail = Boolean(step.result || step.args);

  return (
    <li className={`chat-step chat-step--${status}`}>
      <button
        type="button"
        className="chat-step__head"
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={hasDetail ? open : undefined}
        disabled={!hasDetail}
      >
        <span className="chat-step__icon"><StepIcon status={status} /></span>
        <span className="chat-step__label">{step.label || step.tool}</span>
        {status !== "ok" && (
          <span className="chat-step__status">{STATUS_LABEL[status] || status}</span>
        )}
        {/* Only on a step that actually ran. */}
        {step.risk === "critical" && status !== "declined" && status !== "revised" && (
          <span className="chat-step__risk">approved</span>
        )}
        {hasDetail && <span className="chat-step__chevron">{open ? "−" : "+"}</span>}
      </button>

      {open && (
        <div className="chat-step__detail">
          <div className="chat-step__tool">
            <code>{step.tool}</code>
            {step.args && step.args !== "{}" && <code className="chat-step__args">{step.args}</code>}
          </div>
          {step.result && <pre className="chat-step__result">{step.result}</pre>}
        </div>
      )}
    </li>
  );
}

export default function StepTrail({ steps }) {
  const [open, setOpen] = useState(false);
  if (!steps || steps.length === 0) return null;

  const failures = steps.filter((s) => s.status === "error").length;

  return (
    <div className="chat-steps">
      <button
        type="button"
        className="chat-steps__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="chat-steps__caret" data-open={open ? "true" : "false"}>›</span>
        {steps.length} {steps.length === 1 ? "step" : "steps"}
        {/* Failures show on the collapsed row: that is when the trail most needs reading. */}
        {failures > 0 && (
          <span className="chat-steps__failures">
            {failures} failed
          </span>
        )}
      </button>

      {open && (
        <ol className="chat-steps__list">
          {steps.map((step, i) => (
            <Step key={`${step.tool}-${i}`} step={step} />
          ))}
        </ol>
      )}
    </div>
  );
}
