import React from "react";
import { openUpgrade } from "../../edition";
import { CalendarIcon, CheckIcon, EyeIcon } from "../../ui";
import "./free.css";

// The next step up, said plainly: this workspace governs the AI you deployed, and sees nothing of the AI tools your people use on their own.

const RECORDED = [
  "Every plan Aisty makes, with the exact actions in it",
  "Who approved each action, under which policy",
  "Every action Aisty took, in a hash-chained log",
];

const UNSEEN = [
  ["ChatGPT", "personal accounts in the browser"],
  ["Claude and Gemini", "web and desktop apps"],
  ["Copilot and AI note-takers", "in meetings and documents"],
  ["Your data", "pasted into any of them"],
];

export default function CoverageGap({ cta = "coverage", compact = false }) {
  return (
    <section className={`coverage${compact ? " coverage--compact" : ""}`} aria-labelledby="coverage-title">
      <div className="coverage__head">
        <h2 id="coverage-title">Aisty is on the record. The rest of your team's AI isn't.</h2>
        <p>
          This workspace controls and audits everything its own AI does. It can't see the AI tools your people
          open themselves, which is where most company data leaves.
        </p>
      </div>

      <div className="coverage__grid">
        <div className="coverage__col coverage__col--seen">
          <h3>Recorded in this workspace</h3>
          <ul>
            {RECORDED.map((line) => (
              <li key={line}><CheckIcon size={16} /><span>{line}</span></li>
            ))}
          </ul>
        </div>
        <div className="coverage__col coverage__col--unseen">
          <h3>Not seen by this workspace</h3>
          <ul>
            {UNSEEN.map(([name, where]) => (
              <li key={name}>
                <span className="coverage__unseenName">{name}<small>{where}</small></span>
                <span className="coverage__tag">Not recorded</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="coverage__foot">
        <EyeIcon size={18} className="coverage__footIcon" />
        <p>
          <b>AI tool monitoring</b> comes with hosted Aisty. A light desktop agent records which AI tools are used at
          work, flags the ones you haven't approved, and writes each one into its own audit log next to this one.
        </p>
        <button type="button" className="btn signal medium" onClick={() => openUpgrade(cta)}>
          <CalendarIcon size={16} /> Book a call
        </button>
      </div>
    </section>
  );
}

/** What the employee AI log looks like, with example data. */
export function EmployeeAiExample() {
  const rows = [
    ["Today, 09:42", "a.patel@example.com", "chatgpt.com", "Personal account", "Flagged"],
    ["Today, 09:15", "m.okafor@example.com", "Otter.ai", "Not approved", "Blocked"],
    ["Yesterday, 16:03", "j.reid@example.com", "claude.ai", "Personal account", "Flagged"],
    ["Yesterday, 11:27", "s.lindqvist@example.com", "Microsoft Copilot", "Approved", "Allowed"],
  ];
  return (
    <figure className="employeeAiExample">
      <figcaption>Employee AI log <span>(example data)</span></figcaption>
      <table>
        <thead>
          <tr><th>When</th><th>Person</th><th>AI tool</th><th>Policy</th><th>Outcome</th></tr>
        </thead>
        <tbody>
          {rows.map(([when, who, tool, policy, outcome]) => (
            <tr key={when + tool}>
              <td>{when}</td>
              <td>{who}</td>
              <td><b>{tool}</b></td>
              <td>{policy}</td>
              <td><span className={`employeeAiExample__out employeeAiExample__out--${outcome.toLowerCase()}`}>{outcome}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
