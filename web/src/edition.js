// What Aisty Free is, and what hosted Aisty adds.

export const EDITION = "free";

const UPGRADE_BASE = process.env.REACT_APP_UPGRADE_URL || "https://cal.com/team/aisty/connect";

/** Where "Book a pilot" goes. Carries only the source and which CTA was used. */
export function upgradeUrl(cta) {
  const url = new URL(UPGRADE_BASE);
  url.searchParams.set("source", "aisty-free");
  url.searchParams.set("cta", cta);
  url.searchParams.set("utm_source", "aisty-free");
  url.searchParams.set("utm_medium", "product");
  url.searchParams.set("utm_campaign", cta);
  return url.toString();
}

export function openUpgrade(cta) {
  window.open(upgradeUrl(cta), "_blank", "noopener");
}

// Our model-hosting partner: private, auditable inference for open models.
export const KVRUN = {
  name: "kvrun",
  home: "https://kvrun.com/?utm_source=aisty-free&utm_medium=product&utm_campaign=model-setup",
  quickstart: "https://kvrun.com/docs/quickstart?utm_source=aisty-free&utm_medium=product&utm_campaign=model-setup",
  pitch: "Private, auditable inference for open models on dedicated GPUs in London. Each deployment is an OpenAI-compatible endpoint.",
};

// Hosted features Free shows in place, locked.
export const LOCKED = {
  home: {
    title: "See progress at a glance",
    lede: "Your KPIs tracked against your goals, what the AI finished this week, and what needs a decision, on one page your whole team opens first.",
    benefits: [
      ["KPIs over time", "Track the numbers you set during setup, with movement against the previous period."],
      ["Work in flight", "Tickets in progress, completed and waiting on someone, across every goal."],
      ["Needs attention", "Plans held for approval and tickets that failed, surfaced before they go stale."],
    ],
    preview: "home",
  },
  files: {
    title: "Company Brain",
    lede: "Give Aisty your documents once. Every ticket, suggestion and answer draws on them from then on.",
    benefits: [
      ["Reads what your team reads", "PDFs, Word, Excel, PowerPoint and text, chunked, embedded and linked into a knowledge graph."],
      ["Tickets that know the context", "The agent checks your policies and history before it plans, so it stops asking what it should already know."],
      ["Encrypted per workspace", "Your own encryption key, destroyed with the workspace if you ever leave."],
    ],
    preview: "files",
  },
  insights: {
    title: "Insights from every ticket",
    lede: "Each completed ticket is read for trends, risks and opportunities, and the ones worth acting on reach your dashboard.",
    benefits: [
      ["Spot what is changing", "Recurring patterns across tickets surface as trends before they become problems."],
      ["One click to act", "Turn an insight into a goal or a ticket."],
      ["Categorised and prioritised", "Trends, risks, opportunities and efficiencies, each linked to the ticket it came from."],
    ],
    preview: "insights",
  },
  "aisty-link": {
    title: "Aisty Link",
    lede: "This workspace audits what Aisty does. Aisty Link covers the rest: the AI tools your people use on their own devices, with policy, enforcement and evidence.",
    benefits: [
      ["Know which AI tools are in use", "A light desktop agent records use of ChatGPT, Claude, Gemini and others against your policy."],
      ["Flag or enforce", "Warn, record, or stop an application your policy forbids."],
      ["Evidence for your auditors", "Every violation lands in the same append-only audit trail."],
    ],
    preview: "link",
  },
  enterprise: {
    title: "Enterprise controls",
    lede: "Single sign-on, automated provisioning and on-premises deployment for organisations with their own security architecture.",
    benefits: [
      ["SSO / SAML", "Sign in through Okta, Entra ID or any SAML provider."],
      ["SCIM provisioning", "Joiners and leavers flow from your identity provider automatically."],
      ["On-premises deployment", "Run hosted Aisty's full platform inside your own security boundary."],
    ],
    preview: "enterprise",
  },
  "approval-rules": {
    title: "Approval rules for money and ownership",
    lede: "Hold actions by amount, route them to the owner of each system, and require two people for the riskiest.",
    benefits: [],
    preview: null,
  },
  "evidence": {
    title: "Evidence packs and retention",
    lede: "Your full audit history, viewable and exportable, and one click to turn it into the pack your auditor asks for: AI system card, approvals, actions and model changes, with retention windows you set.",
    benefits: [],
    preview: null,
  },
  "integrations": {
    title: "Every integration",
    lede: "Outlook, Teams, Salesforce, Apollo, LinkedIn, NetSuite, Xero, Stripe, Confluence, ServiceNow, SIEM export and identity provisioning, maintained and tested by us.",
    benefits: [],
    preview: null,
  },
  "company-profile": {
    title: "Company profile",
    lede: "Your description, products, industry, location and website, read by Company Brain alongside your documents so every answer and plan is grounded in how your business works.",
    benefits: [],
    preview: null,
  },
  "company-brain": {
    title: "Give Aisty your company's knowledge",
    lede: "With Company Brain, the agent reads your SOPs, contracts and past work before it plans, so tickets like this one finish instead of stopping for context.",
    benefits: [],
    preview: null,
  },
};

// Integrations Free ships. Everything else in the catalog is shown locked.
export const FREE_INTEGRATIONS = new Set(["github", "jira", "slack", "gmail", "hubspot"]);

// Free celebrates progress once, at this many completed tickets.
export const MILESTONE_TICKETS = 25;
