import { truncate } from "./format";

// Who authorised this row, or that nobody was asked.
export function authorisationCell(row) {
  const action = row.action || "";
  const meta = row.metadata || {};
  const who = meta.approvedByEmail || meta.approvedBy || row.userEmail || row.userId || "";

  if (action === "policy.violation") return <span className="secondary-text">–</span>;

  if (action === "ai.tool.executed") {
    // approvalMode is the precise answer; `approved` is the older boolean and still the only thing rows written before it carry.
    const mode = meta.approvalMode || (meta.approved ? "human" : meta.approved === false ? "auto" : "");
    if (mode === "human") {
      return <span className="auditTrail__authPill auditTrail__authPill--human">Approved by {who || "a person"}</span>;
    }
    if (mode === "preapproved") {
      return (
        <span
          className="auditTrail__authPill auditTrail__authPill--human"
          title="Nobody was asked on this run. It replayed a plan a person approved on an earlier run."
        >
          Pre-approved{who ? ` by ${who}` : ""}
        </span>
      );
    }
    if (mode === "auto") {
      return (
        <span
          className="auditTrail__authPill auditTrail__authPill--auto"
          title={
            meta.level
              ? `Nobody was asked. The approval policy is set to "${meta.level}", which does not hold actions of this risk.`
              : "Nobody was asked. The approval policy allowed this to run."
          }
        >
          Auto-approved{meta.level ? ` (${meta.level})` : ""}
        </span>
      );
    }
    return <span className="secondary-text">unknown</span>;
  }

  if (action === "ai.approval.approved") {
    return <span className="auditTrail__authPill auditTrail__authPill--human">Approved by {who || "a person"}</span>;
  }
  if (action === "ai.approval.declined") {
    return <span className="auditTrail__authPill auditTrail__authPill--declined">Declined by {who || "a person"}</span>;
  }
  if (action === "ai.approval.revised") {
    return <span className="auditTrail__authPill auditTrail__authPill--declined">Sent back by {who || "a person"}</span>;
  }
  if (action === "ai.approval.requested") {
    return <span className="auditTrail__authPill auditTrail__authPill--pending">Asked a person</span>;
  }
  return <span className="secondary-text">–</span>;
}

/** What came of it: blocked/flagged for violations, completed/failed for AI runs. */
export function outcomeCell(row) {
  const action = row.action || "";
  const meta = row.metadata || {};

  if (action === "policy.violation") {
    const enforce = meta.mode === "enforce";
    // One row is a whole coalescing window, not a single instant.
    const window = Number(meta.windowMs) > 0 ? Math.round(Number(meta.windowMs) / 60000) : 0;
    return (
      <span
        className={`auditTrail__modePill auditTrail__modePill--${enforce ? "enforce" : "flag"}`}
        title={
          window
            ? `First detection in a ${window}-minute window. Repeats of the same policy and app inside it are not reported again.`
            : undefined
        }
      >
        {enforce ? "Blocked" : "Flagged"}
      </span>
    );
  }
  if (action === "ai.tool.executed") {
    return meta.outcome === "error" ? (
      <span className="auditTrail__riskPill auditTrail__riskPill--critical">Failed</span>
    ) : (
      <span className="auditTrail__riskPill auditTrail__riskPill--low">Ran</span>
    );
  }
  return <span className="secondary-text">–</span>;
}

// Detail rows for an AI action entry, or null if this is not one.
export function aiActionDetail(row) {
  const action = row.action || "";
  if (!/^ai\.(approval\.|tool\.)/.test(action)) return null;

  const meta = row.metadata || {};
  const items = [];

  items.push({
    label: "Action",
    value: row.resource || meta.tool || "an AI action",
  });

  if (meta.tool && meta.tool !== row.resource) {
    items.push({ label: "Tool", value: <code>{meta.tool}</code> });
  }

  if (meta.risk) {
    items.push({
      label: "Risk",
      // Local class rather than the shared .approval-chip: that one lives in styles/approvals/approvalCard.css, which this view does not import.
      value: <span className={`auditTrail__riskPill auditTrail__riskPill--${meta.risk}`}>{meta.risk}</span>,
    });
  }

  // "Decided by", not "approved by": the same row covers declines and send-backs.
  const decided = /^ai\.tool\./.test(action)
    ? "Ran for"
    : /requested$/.test(action) ? "Requested for" : "Decided by";
  items.push({
    label: decided,
    value: row.userEmail || row.userId || "–",
  });

  if (meta.level) {
    items.push({ label: "Policy in force", value: <code>{meta.level}</code> });
  }

  if (/^ai\.tool\./.test(action)) {
    items.push({
      label: "Outcome",
      value: meta.outcome === "error"
        ? <span className="auditTrail__riskPill auditTrail__riskPill--critical">Failed</span>
        : <span className="auditTrail__riskPill auditTrail__riskPill--low">Completed</span>,
    });
    const mode = meta.approvalMode
      || (meta.approved === true ? "human" : meta.approved === false ? "auto" : "");
    if (mode) {
      items.push({
        label: "Why it ran",
        value: {
          human: "A person reviewed this exact action and approved it",
          preapproved:
            "Nobody was asked on this run: it replayed a plan a person had already approved",
          auto: meta.level
            ? `Nobody was asked. The approval policy is set to "${meta.level}", which does not hold actions of this risk`
            : "Nobody was asked. The approval policy allowed it",
        }[mode],
      });
    }
    // The person the agent worked for and the one who authorised it often differ.
    if (meta.approvedByEmail || meta.approvedBy) {
      items.push({
        label: mode === "preapproved" ? "Originally approved by" : "Approved by",
        value: meta.approvedByEmail || meta.approvedBy,
      });
    }
  }

  if (meta.chatId) {
    items.push({
      label: "Chat",
      value: (
        <a
          className="auditTrail__detailLink"
          href={`/chat?chatId=${encodeURIComponent(meta.chatId)}`}
          onClick={(e) => e.stopPropagation()}
        >
          Open the conversation
        </a>
      ),
    });
  }

  if (meta.ticketId) {
    items.push({
      label: "Ticket",
      value: (
        <a
          className="auditTrail__detailLink"
          href={`/goals?ticketId=${encodeURIComponent(meta.ticketId)}`}
          onClick={(e) => e.stopPropagation()}
        >
          {truncate(meta.ticketId, 24)}
        </a>
      ),
    });
  }

  if (meta.stepCount) {
    items.push({
      label: "Plan",
      value: `${meta.stepCount} step${meta.stepCount === 1 ? "" : "s"}` +
        (meta.steps && meta.steps.length ? `, ${meta.steps.join(", ")}` : ""),
    });
  }

  if (meta.recurring) {
    items.push({ label: "Recurring", value: "Yes, runs on a schedule" });
  }

  return items;
}
