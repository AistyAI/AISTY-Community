// components/integrations/ConnectorCard.js
import React from "react";
import { CATEGORY_LABELS } from "./catalog";
import { LockIcon } from "../../ui";

export function StatusPill({ status, children }) {
  return <span className={`statusPill statusPill--${status}`}>{children}</span>;
}

export const STATUS_TEXT = { connected: "Connected", attention: "Needs attention", available: "Not connected" };

export default function ConnectorCard({ connector, state, onOpen }) {
  return (
    <button type="button" className={`connectorCard connectorCard--${state.status}${connector.locked ? " connectorCard--locked" : ""}`} onClick={onOpen}
      aria-label={`${connector.name}: ${STATUS_TEXT[state.status]}`}>
      <div className="connectorCard__head">
        <span className="connectorCard__logo">{connector.logo}</span>
        <span className="connectorCard__titles">
          <span className="connectorCard__name">{connector.name}</span>
          <span className="connectorCard__category">{CATEGORY_LABELS[connector.category]}</span>
        </span>
        {state.status !== "available" && (
          <span className={`statusDot statusDot--${state.status}`} title={STATUS_TEXT[state.status]} aria-hidden="true" />
        )}
      </div>
      <p className="connectorCard__description">{connector.description}</p>
      <div className="connectorCard__foot">
        {state.status === "attention" ? (
          <span className="connectorCard__summary connectorCard__summary--attention">Needs attention</span>
        ) : (
          <span className="connectorCard__summary">{state.summary || " "}</span>
        )}
        {connector.locked
          ? <span className="lockBadge"><LockIcon size={12} /> Hosted</span>
          : <span className="connectorCard__action">{state.status === "available" ? "Connect" : "Manage"}</span>}
      </div>
    </button>
  );
}
