import React from "react";
import { Link } from "react-router-dom";
import { LOCKED, openUpgrade } from "../../edition";
import { LockIcon, CalendarIcon } from "../../ui";
import "./free.css";

// Example screens for the hosted features.

function HomePreview() {
  const kpis = [["Monthly revenue", "£438k", "+6.3%", "up"], ["Tickets closed", "140", "+15.7%", "up"], ["Days sales outstanding", "37", "−9.8%", "down"]];
  const bars = [32, 41, 38, 52, 47, 58, 61, 55, 66, 72, 69, 78];
  return (
    <div className="ex ex--home">
      <div className="ex-kpis">
        {kpis.map(([name, value, delta, dir]) => (
          <div className="ex-kpi" key={name}>
            <span className="ex-kpi__name">{name}</span>
            <span className="ex-kpi__value">{value}</span>
            <span className={`ex-kpi__delta ex-kpi__delta--${dir}`}>{delta} on last month</span>
          </div>
        ))}
      </div>
      <div className="ex-chart">
        <span className="ex-chart__title">Tickets completed per week</span>
        <svg viewBox="0 0 360 90" preserveAspectRatio="none" aria-hidden="true">
          {bars.map((h, i) => <rect key={i} x={i * 30 + 4} y={90 - h} width="20" height={h} rx="2" />)}
        </svg>
      </div>
    </div>
  );
}

function FilesPreview() {
  const rows = [
    ["Expense policy 2026.pdf", "Finance", "142 passages"],
    ["Customer onboarding SOP.docx", "Operations", "38 passages"],
    ["Northwind master services agreement.pdf", "Legal", "96 passages"],
    ["Pricing playbook.pptx", "Sales", "51 passages"],
  ];
  return (
    <div className="ex ex--table">
      {rows.map(([name, folder, meta]) => (
        <div className="ex-row" key={name}>
          <span className="ex-row__main">{name}</span>
          <span className="ex-row__muted">{folder}</span>
          <span className="ex-row__muted">{meta}</span>
          <span className="ex-pill">Ready</span>
        </div>
      ))}
    </div>
  );
}

function InsightsPreview() {
  const items = [
    ["Trend", "Refund requests are up a third since the pricing change", "From 12 support tickets"],
    ["Risk", "Three contracts renew in 30 days with no owner", "From a contract review ticket"],
    ["Efficiency", "Month-end close repeats the same six manual steps", "From a recurring ticket"],
  ];
  return (
    <div className="ex ex--table">
      {items.map(([cat, title, src]) => (
        <div className="ex-row" key={title}>
          <span className="ex-row__tag">{cat}</span>
          <span className="ex-row__main">{title}</span>
          <span className="ex-row__muted">{src}</span>
        </div>
      ))}
    </div>
  );
}

function LinkPreview() {
  const rows = [["chatgpt.com on personal accounts", "Flag", "14 devices"], ["Unapproved meeting note-takers", "Block", "3 stopped"], ["claude.ai on personal accounts", "Flag", "6 devices"]];
  return (
    <div className="ex ex--table">
      {rows.map(([name, mode, n]) => (
        <div className="ex-row" key={name}>
          <span className="ex-row__main">{name}</span>
          <span className="ex-row__tag">{mode}</span>
          <span className="ex-row__muted">{n}</span>
        </div>
      ))}
    </div>
  );
}

function EnterprisePreview() {
  const rows = [["Single sign-on", "Okta, SAML 2.0"], ["Provisioning", "SCIM, 212 people synced"], ["Deployment", "On-premises, your network"]];
  return (
    <div className="ex ex--table">
      {rows.map(([name, value]) => (
        <div className="ex-row" key={name}>
          <span className="ex-row__main">{name}</span>
          <span className="ex-row__muted">{value}</span>
        </div>
      ))}
    </div>
  );
}

const PREVIEWS = { home: HomePreview, files: FilesPreview, insights: InsightsPreview, link: LinkPreview, enterprise: EnterprisePreview };

/** A full page for a feature hosted Aisty adds. */
export default function LockedFeature({ feature }) {
  const f = LOCKED[feature];
  if (!f) return null;
  const Preview = PREVIEWS[f.preview];
  return (
    <div className="lockedPage">
      <header className="lockedPage__head">
        <p className="hostedNote"><LockIcon size={14} /> Comes with hosted Aisty</p>
        <h1>{f.title}</h1>
        <p className="lockedPage__lede">{f.lede}</p>
        <div className="lockedPage__ctas">
          <button type="button" className="btn primary large" onClick={() => openUpgrade(`locked-${feature}`)}>
            <CalendarIcon size={16} /> Book a call
          </button>
          <Link className="btn secondary large" to="/plan">What upgrading adds</Link>
        </div>
      </header>

      {Preview && (
        <figure className="lockedPage__example">
          <figcaption>Example</figcaption>
          <Preview />
        </figure>
      )}

      {f.benefits.length > 0 && (
        <dl className="lockedPage__points">
          {f.benefits.map(([title, body]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{body}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** A hosted feature inside a live page: one line of what it does, one action. */
export function LockedPanel({ feature, children }) {
  const f = LOCKED[feature];
  return (
    <div className="lockedPanel">
      <LockIcon size={16} className="lockedPanel__icon" />
      <div className="lockedPanel__text">
        <p className="lockedPanel__title">{f.title}</p>
        <p>{children || f.lede}</p>
      </div>
      <button type="button" className="btn secondary small" onClick={() => openUpgrade(`panel-${feature}`)}>Book a call</button>
    </div>
  );
}

/** A one-line note, for a wall met in the middle of work. */
export function UpgradeNudge({ cta, children, action = "Book a call" }) {
  return (
    <p className="upgradeNudge">
      <LockIcon size={14} />
      <span>{children}</span>
      <button type="button" onClick={() => openUpgrade(cta)}>{action}</button>
    </p>
  );
}
