import React, { useState } from 'react';
import { Button } from '../../ui';
import { WarningIcon, CheckIcon, CloseIcon, EditIcon, ChevronDownIcon, SpinnerIcon } from '../utils/Icons';
import '../../styles/approvals/approvalCard.css';

// One card for every AI action that is waiting on a person.

const RISK_LABELS = {
  low: 'Low risk',
  medium: 'Changes your data',
  critical: 'High risk',
};

const MAX_VISIBLE_STEPS = 6;

// Friendlier names for the parameters a plan step carries.
const ARG_LABELS = {
  q: 'Search for',
  query: 'Search for',
  per_page: 'Results',
  limit: 'Results',
  path: 'File',
  title: 'Title',
  sections: 'Sections',
  sheets: 'Sheets',
  content: 'Content',
  description: 'Notes',
  to: 'To',
  subject: 'Subject',
  body: 'Body',
  owner: 'Owner',
  repo: 'Repository',
  issue_number: 'Issue',
  pr_number: 'Pull request',
  project_key: 'Project',
  summary: 'Summary',
};

function labelForArg(key) {
  return ARG_LABELS[key] || key.replace(/_/g, ' ');
}

/** Identifier-ish arguments read better in mono; prose does not. */
const CODE_ARGS = new Set([
  'path', 'repo', 'owner', 'issue_number', 'pr_number', 'project_key',
  'issue_id', 'page_id', 'space_key', 'chat_id', 'ticket_id', 'key', 'url',
]);

// Render an argument value for a human.
function formatValue(value) {
  if (value === null || value === undefined) return '–';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (!value.length) return 'None';
    // Prefer a named summary: headings and titles are what identify a section.
    const named = value
      .map((v) => (v && typeof v === 'object' ? v.heading || v.name || v.title : v))
      .filter((v) => typeof v === 'string' && v.trim());
    if (named.length) {
      const shown = named.slice(0, 4).join(' · ');
      return named.length > 4
        ? `${value.length} items: ${shown} …`
        : `${value.length} item${value.length === 1 ? '' : 's'}: ${shown}`;
    }
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return 'None';
    return keys.slice(0, 5).map(labelForArg).join(', ') + (keys.length > 5 ? ' …' : '');
  }

  return String(value);
}

function RiskChip({ risk }) {
  if (!risk) return null;
  return (
    <span className={`approval-chip approval-chip--${risk}`}>
      {RISK_LABELS[risk] || risk}
    </span>
  );
}

/** Argument list for a single tool call. Long values are clamped, not truncated. */
function ArgumentList({ args }) {
  const entries = Object.entries(args || {});
  if (!entries.length) {
    return <p className="approval-card__empty">This action takes no arguments.</p>;
  }
  return (
    <dl className="approval-args">
      {entries.map(([key, value]) => (
        <div className="approval-args__row" key={key}>
          <dt className="approval-args__key">{labelForArg(key)}</dt>
          <dd
            className={`approval-args__value${CODE_ARGS.has(key) ? ' approval-args__value--code' : ''}`}
          >
            {formatValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// The plan as a flow, before the step-by-step detail.
function PlanFlow({ steps }) {
  const list = Array.isArray(steps) ? steps : [];
  if (list.length < 2) return null; // a single step is not a flow

  return (
    <div className="planFlow" role="list" aria-label="Planned sequence">
      {list.map((step, i) => (
        // The connector belongs to the node that FOLLOWS it.
        <span className="planFlow__link" key={step.index}>
          {i > 0 && <span className="planFlow__arrow" aria-hidden="true">→</span>}
          <span
            role="listitem"
            className={`planFlow__node planFlow__node--${step.risk || 'low'}`}
            title={step.description || step.type}
          >
            <span className="planFlow__nodeIndex">{step.index}</span>
            <span className="planFlow__nodeLabel">{step.label || step.type}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

/** The planned workflow, step by step. */
function StepList({ steps }) {
  const [expanded, setExpanded] = useState(false);
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) {
    return <p className="approval-card__empty">This plan has no steps.</p>;
  }

  const hidden = list.length - MAX_VISIBLE_STEPS;
  const visible = expanded ? list : list.slice(0, MAX_VISIBLE_STEPS);

  return (
    <>
      <ol className="approval-steps">
        {visible.map((step) => (
          <li className="approval-steps__item" key={step.index}>
            <span className="approval-steps__num">{step.index}</span>
            <div className="approval-steps__body">
              <span className="approval-steps__label">
                {step.label || step.type}
                {step.risk === 'critical' && <RiskChip risk="critical" />}
              </span>
              {step.description && (
                <span className="approval-steps__desc">{step.description}</span>
              )}
              {step.args && Object.keys(step.args).length > 0 && (
                <ArgumentList args={step.args} />
              )}
            </div>
          </li>
        ))}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          className="approval-card__more"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDownIcon />
          {expanded ? 'Show fewer steps' : `Show ${hidden} more step${hidden === 1 ? '' : 's'}`}
        </button>
      )}
    </>
  );
}

/** A decided card collapses to a single line so history stays readable. */
function ResolvedSummary({ approval }) {
  const { status, resolvedAt, revisionNote } = approval;
  const when = resolvedAt
    ? new Date(resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const copy = {
    approved: { icon: <CheckIcon />, text: 'Approved', tone: 'approved' },
    declined: { icon: <CloseIcon />, text: 'Declined', tone: 'declined' },
    revised: { icon: <EditIcon />, text: 'Changes requested', tone: 'revised' },
    expired: { icon: <WarningIcon />, text: 'Expired without a decision', tone: 'expired' },
  }[status];

  if (!copy) return null;

  return (
    <div className={`approval-card__resolved approval-card__resolved--${copy.tone}`}>
      <span className="approval-card__resolved-icon">{copy.icon}</span>
      <span>
        {copy.text}
        {when && ` · ${when}`}
        {revisionNote && <span className="approval-card__note">“{revisionNote}”</span>}
      </span>
    </div>
  );
}

export default function ApprovalCard({ approval, busy = false, disabled = false, onDecision }) {
  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState('');

  if (!approval) return null;

  const isWorkflow = approval.kind === 'ticket_workflow';
  const isPending = approval.status === 'pending';

  // An extension is not a new plan.
  const isExtension = isWorkflow && approval.isExtension;
  const stepCount = (approval.steps || []).length;
  const title = !isWorkflow
    ? 'Approve this action'
    : isExtension
      ? `Approve ${stepCount} extra step${stepCount === 1 ? '' : 's'}`
      : `Approve this ${stepCount}-step plan`;

  const decide = (decision) => {
    if (busy || disabled) return;
    if (decision === 'revise') {
      if (!note.trim()) return;
      onDecision('revise', note.trim());
      setNote('');
      setRevising(false);
      return;
    }
    onDecision(decision, '');
  };

  return (
    <section
      className={`approval-card approval-card--${approval.risk || 'medium'}${
        isPending ? '' : ' approval-card--resolved'
      }`}
      aria-label={title}
    >
      <header className="approval-card__header">
        <span className="approval-card__icon"><WarningIcon /></span>
        <div className="approval-card__heading">
          <h4 className="approval-card__title">{title}</h4>
          {isWorkflow && approval.ticketTitle && (
            <span className="approval-card__subtitle">{approval.ticketTitle}</span>
          )}
          {!isWorkflow && approval.label && (
            <span className="approval-card__subtitle">{approval.label}</span>
          )}
        </div>
        <RiskChip risk={approval.risk} />
      </header>

      <div className="approval-card__body">
        {isWorkflow ? (
          <>
            {isExtension && (
              <p className="approval-card__extensionNote">
                Aisty has already completed{' '}
                <strong>
                  {approval.completedCount} step
                  {approval.completedCount === 1 ? '' : 's'}
                </strong>{' '}
                of the approved plan and needs these to finish. Declining keeps
                the work done so far and stops here.
              </p>
            )}
            {/* Shape of the run first, detail underneath; the decision is usually made on the shape. */}
            <PlanFlow steps={approval.steps} />
            <StepList steps={approval.steps} />
          </>
        ) : (
          <ArgumentList args={approval.args} />
        )}
      </div>

      {!isPending && <ResolvedSummary approval={approval} />}

      {isPending && !disabled && (
        <>
          {revising && (
            <div className="approval-card__revise">
              <label className="approval-card__revise-label" htmlFor={`revise-${approval.approvalId}`}>
                What should change?
              </label>
              <textarea
                id={`revise-${approval.approvalId}`}
                className="approval-card__textarea"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isWorkflow
                    ? 'e.g. skip the email step and add a summary document instead'
                    : 'e.g. use the title “Q3 review” instead'
                }
                rows={3}
                autoFocus
              />
            </div>
          )}

          <footer className="approval-card__actions">
            {revising ? (
              <>
                <Button variant="primary" size="small" disabled={busy || !note.trim()}
                  onClick={() => decide('revise')}>
                  Send changes
                </Button>
                <Button variant="secondary" size="small" disabled={busy}
                  onClick={() => { setRevising(false); setNote(''); }}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" size="small" disabled={busy} onClick={() => decide('approve')}>
                  {busy ? <SpinnerIcon /> : <CheckIcon />} Approve
                </Button>
                <Button variant="secondary" size="small" disabled={busy} onClick={() => setRevising(true)}>
                  Request changes
                </Button>
                <button
                  type="button"
                  className="approval-card__decline"
                  disabled={busy}
                  onClick={() => decide('decline')}
                >
                  Decline
                </button>
              </>
            )}
          </footer>
        </>
      )}

      {isPending && disabled && (
        <p className="approval-card__empty">
          Waiting on an owner or admin to decide.
        </p>
      )}
    </section>
  );
}
