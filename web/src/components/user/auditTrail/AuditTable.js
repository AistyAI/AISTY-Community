import React from "react";
import { aiActionDetail, authorisationCell, outcomeCell } from "./cells";
import { formatWhen, agentSource, describeAction, verbOf } from "./format";
import { formatRole } from "../../utils/WorkspaceRoleContext";

// The audit rows, in the compliance layout for AI activity and the standard layout otherwise.
export default function AuditTable({ expandedId, rows, scope, setExpandedId }) {
  return (
    <div className="auditTrail__tableWrap">
      {scope === "aisty_link" ? (
        <table className="auditTrail__table auditTrail__table--compliance">
          <colgroup>
            <col className="auditTrail__col--when" />
            <col className="auditTrail__col--user" />
            <col className="auditTrail__col--source" />
            <col className="auditTrail__col--what" />
            <col className="auditTrail__col--risk" />
            <col className="auditTrail__col--auth" />
            <col className="auditTrail__col--out" />
          </colgroup>
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Source</th>
              <th>What happened</th>
              <th>Risk</th>
              <th>Authorisation</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const m = row.metadata || {};
              const isViolation = row.action === "policy.violation";
              // AI rows carry the same structured detail the workspace feed expands, so they expand here too rather than being flattened into a narrower version of themselves.
              const aiDetail = aiActionDetail(row);
              const isOpen = expandedId === row._id;
              return (
                <React.Fragment key={row._id}>
                  <tr
                    className={`auditTrail__row auditTrail__row--${isViolation ? "flagged" : "executed"}${
                      aiDetail ? " auditTrail__row--expandable" : ""
                    }${isOpen ? " is-open" : ""}`}
                    onClick={aiDetail ? () => setExpandedId(isOpen ? null : row._id) : undefined}
                  >
                    <td title={row.createdAt} className="auditTrail__when">{formatWhen(row.createdAt)}</td>
                    <td>{row.userEmail || row.userId || <span className="secondary-text">–</span>}</td>
                    <td>
                      {isViolation
                        ? (m.device || "Aisty Link")
                        : <span className="auditTrail__rolePill">{agentSource(m)}</span>}
                    </td>
                    <td>
                      <div className="auditTrail__describe">
                        {aiDetail && (
                          <button
                            type="button"
                            className={`auditTrail__expandBtn${isOpen ? " is-open" : ""}`}
                            aria-expanded={isOpen}
                            aria-label={isOpen ? "Hide AI action detail" : "Show AI action detail"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(isOpen ? null : row._id);
                            }}
                          >
                            ›
                          </button>
                        )}
                        <div className="auditTrail__describeBody">
                          <span className="auditTrail__describeText">{describeAction(row)}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {isViolation && m.severity ? (
                        <span className={`auditTrail__sevPill auditTrail__sevPill--${m.severity}`}>{m.severity}</span>
                      ) : m.risk ? (
                        <span className={`auditTrail__riskPill auditTrail__riskPill--${m.risk}`}>{m.risk}</span>
                      ) : (
                        <span className="secondary-text">–</span>
                      )}
                    </td>
                    <td>{authorisationCell(row)}</td>
                    <td>{outcomeCell(row)}</td>
                  </tr>
                  {aiDetail && isOpen && (
                    <tr className="auditTrail__detailRow">
                      <td colSpan={7}>
                        <dl className="auditTrail__detail">
                          {aiDetail.map((item) => (
                            <div className="auditTrail__detailItem" key={item.label}>
                              <dt>{item.label}</dt>
                              <dd>{item.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      ) : (
        <table className="auditTrail__table auditTrail__table--workspace">
          <colgroup>
            <col className="auditTrail__col--when" />
            <col className="auditTrail__col--user" />
            <col className="auditTrail__col--role" />
            <col className="auditTrail__col--what" />
          </colgroup>
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Role</th>
              <th>What happened</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const verb = verbOf(row.action);
              // AI approval rows carry structured context (which chat, which tool, which risk tier) that is worth showing but too wide for the row itself.
              const aiDetail = aiActionDetail(row);
              const isOpen = expandedId === row._id;
              return (
                <React.Fragment key={row._id}>
                  <tr
                    className={`auditTrail__row auditTrail__row--${verb}${
                      aiDetail ? " auditTrail__row--expandable" : ""
                    }${isOpen ? " is-open" : ""}`}
                    onClick={aiDetail ? () => setExpandedId(isOpen ? null : row._id) : undefined}
                  >
                    <td title={row.createdAt} className="auditTrail__when">{formatWhen(row.createdAt)}</td>
                    <td>{row.userEmail || row.userId || <span className="secondary-text">–</span>}</td>
                    <td>{row.workspaceRole ? <span className="auditTrail__rolePill">{formatRole(row.workspaceRole)}</span> : <span className="secondary-text">–</span>}</td>
                    <td>
                      <div className={`auditTrail__describe auditTrail__describe--${verb}`}>
                        {aiDetail && (
                          <button
                            type="button"
                            className={`auditTrail__expandBtn${isOpen ? " is-open" : ""}`}
                            aria-expanded={isOpen}
                            aria-label={isOpen ? "Hide AI action detail" : "Show AI action detail"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(isOpen ? null : row._id);
                            }}
                          >
                            ›
                          </button>
                        )}
                        <div className="auditTrail__describeBody">
                          <span className="auditTrail__describeText">{describeAction(row)}</span>
                          <code className="auditTrail__describeCode" title="Internal action code">{row.action}</code>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {aiDetail && isOpen && (
                    <tr className="auditTrail__detailRow">
                      <td colSpan={4}>
                        <dl className="auditTrail__detail">
                          {aiDetail.map((item) => (
                            <div className="auditTrail__detailItem" key={item.label}>
                              <dt>{item.label}</dt>
                              <dd>{item.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
