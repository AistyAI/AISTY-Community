// Every connector the Integrations page offers and how it connects.
import React from "react";
import { FREE_INTEGRATIONS } from "../../edition";
import {
  GitHubIcon, XeroIcon, JiraIcon, StripeIcon, GmailIcon, LinkedInIcon,
  ApolloIcon, OutlookIcon, HubSpotIcon,
} from "../utils/Icons";

export const CATEGORIES = [
  { key: "communication", label: "Communication" },
  { key: "crm", label: "CRM & Sales" },
  { key: "finance", label: "Finance & Payments" },
  { key: "compliance", label: "Risk & Compliance" },
  { key: "security", label: "Security & IT" },
  { key: "engineering", label: "Engineering" },
];

export const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

// Brand tiles for connectors without a bundled logo: a monogram on the brand's colour reads cleanly at 32–40px and never misrepresents a mark.
function Monogram({ text, bg, fg = "#fff" }) {
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill={bg} />
      <text x="20" y="25.5" textAnchor="middle" fontFamily="system-ui, sans-serif"
        fontSize={text.length > 2 ? 12 : 15} fontWeight="700" fill={fg}>{text}</text>
    </svg>
  );
}

function GlyphTile({ bg, children }) {
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill={bg} />
      <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        transform="translate(8 8)">{children}</g>
    </svg>
  );
}

const ArchiveGlyph = () => (
  <GlyphTile bg="#334155">
    <rect x="2" y="3" width="20" height="5" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </GlyphTile>
);
const SiemGlyph = () => (
  <GlyphTile bg="#0f766e">
    <path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z" />
    <path d="M8 12l3 3 5-6" />
  </GlyphTile>
);
const ScimGlyph = () => (
  <GlyphTile bg="#1e3a8a">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M17 7v6M14 10h6" />
  </GlyphTile>
);

const TOKEN_EXPIRY_FIELD = { key: "expiresAt", label: "Token expiry (optional, ISO date)", type: "text", placeholder: "2026-12-31T00:00:00Z" };

const ALL_CONNECTORS = [
  // Communication
  {
    key: "outlook",
    name: "Outlook",
    category: "communication",
    logo: <OutlookIcon />,
    description: "Microsoft 365 mailboxes the AI can read, search, draft and send from.",
    capabilities: ["Read, search and triage mail", "Draft and send replies", "Act as any connected mailbox, personal or shared"],
    keywords: "email mail microsoft 365 exchange office",
    connect: { kind: "email", provider: "outlook" },
    security: "Uses your own Entra app. Its client secret is encrypted in your browser, kept in the vault, and never sent to the AI, which only receives access tokens that expire within the hour.",
  },
  {
    key: "gmail",
    name: "Gmail",
    category: "communication",
    logo: <GmailIcon />,
    description: "Google Workspace mailboxes the AI can read and send from.",
    capabilities: ["Read recent mail", "Send email with AI disclosure", "Act as any connected mailbox"],
    keywords: "email mail google workspace",
    connect: {
      kind: "form",
      endpoint: "/gmail/connect",
      help: "Create a Google Cloud service account, enable domain-wide delegation for the gmail.readonly and gmail.send scopes in your Workspace admin console, then upload its JSON key and the mailbox the AI should act as.",
      fields: [
        { key: "serviceAccountKey", label: "Service account key (JSON)", type: "file-json", required: true },
        { key: "email", label: "Mailbox", type: "text", placeholder: "ops@yourfirm.com", required: true },
      ],
    },
    summary: (rows) => rows[0]?.meta?.email,
    security: "Uses your own service account. Its key is encrypted in your browser and stored encrypted on your server; the AI only ever receives access tokens that expire within the hour.",
  },
  {
    key: "teams",
    name: "Microsoft Teams",
    category: "communication",
    logo: <Monogram text="T" bg="#5059C9" />,
    description: "Post updates to the Teams channels you connect.",
    capabilities: ["Post to connected channels", "AI disclosure on every message", "Captured by your archive before posting"],
    keywords: "microsoft chat messaging channels webhook workflows",
    connect: { kind: "teams" },
    summary: (rows) => {
      const n = rows[0]?.meta?.channels?.length || 0;
      return n === 1 ? rows[0].meta.channels[0] : `${n} channels`;
    },
    security: "Each channel's webhook URL is encrypted in your browser and kept in the vault; it is never shown again.",
  },
  {
    key: "slack",
    name: "Slack",
    category: "communication",
    logo: <Monogram text="S" bg="#4A154B" />,
    description: "Read channel history and post as the Aisty bot.",
    capabilities: ["List channels and find people", "Read channels the bot is in", "Post messages and thread replies"],
    keywords: "chat messaging channels bot",
    connect: {
      kind: "form",
      endpoint: "/slack/connect",
      help: "Create a Slack app with the channels:read, channels:history, groups:read, groups:history, chat:write and users:read.email scopes, install it, and paste the Bot User OAuth Token. Invite the bot to the channels it should use.",
      fields: [{ key: "botToken", label: "Bot token", type: "password", placeholder: "xoxb-…", required: true }],
    },
    summary: (rows) => rows[0]?.meta?.teamName && `${rows[0].meta.teamName} workspace`,
  },

  // CRM & Sales
  {
    key: "salesforce",
    name: "Salesforce",
    category: "crm",
    logo: <Monogram text="SF" bg="#00A1E0" />,
    description: "Query and update accounts, contacts, leads and opportunities, Financial Services Cloud included.",
    capabilities: ["Read-only SOQL and full-text search", "Create and update records of any object", "Log activities against records"],
    keywords: "crm fsc financial services cloud opportunities leads",
    connect: {
      kind: "form",
      endpoint: "/salesforce/connect",
      help: "In Salesforce Setup, create an External Client App with the OAuth client credentials flow enabled and a dedicated integration user as its “run as” user. Paste its consumer key and secret.",
      fields: [
        { key: "instanceUrl", label: "My Domain URL", type: "text", placeholder: "yourfirm.my.salesforce.com", required: true },
        { key: "clientId", label: "Consumer key", type: "password", required: true },
        { key: "clientSecret", label: "Consumer secret", type: "password", required: true },
      ],
    },
    summary: (rows) => rows[0]?.meta?.username,
  },
  {
    key: "hubspot",
    name: "HubSpot",
    category: "crm",
    logo: <HubSpotIcon />,
    description: "Contacts, companies, deals and pipeline in HubSpot CRM.",
    capabilities: ["Search and update contacts and companies", "Manage deals and pipeline stages", "Log notes and calls"],
    keywords: "crm deals pipeline",
    connect: {
      kind: "form",
      endpoint: "/hubspot/connect",
      help: "Create a Private App in HubSpot (Settings → Integrations → Private Apps) and paste its access token.",
      fields: [{ key: "accessToken", label: "Private app access token", type: "password", placeholder: "pat-…", required: true }],
    },
  },
  {
    key: "apollo",
    name: "Apollo.io",
    category: "crm",
    logo: <ApolloIcon />,
    description: "Prospect search, enrichment, lists and outbound sequences.",
    capabilities: [
      "Find and enrich people and companies",
      "Manage contacts and accounts",
      "Read and edit contact lists",
      "Review sequences, enrol contacts and stop them",
    ],
    keywords: "prospecting enrichment outbound sales sequences lists",
    connect: {
      kind: "form",
      endpoint: "/apollo/connect",
      fields: [{ key: "apiKey", label: "API key", type: "password", required: true }],
    },
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    category: "crm",
    logo: <LinkedInIcon />,
    description: "Profile research, messaging and company posts.",
    capabilities: ["Search people and companies", "Send messages", "Post updates"],
    keywords: "social outreach",
    connect: {
      kind: "form",
      endpoint: "/linkedin/connect",
      help: "Paste an access token generated for your LinkedIn developer app (tokens last 60 days; add the refresh token if your app has one).",
      fields: [
        { key: "accessToken", label: "Access token", type: "password", required: true },
        { key: "refreshToken", label: "Refresh token (optional)", type: "password" },
        { key: "expiresAt", label: "Token expiry (optional, ISO date)", type: "text", placeholder: "2026-12-31T00:00:00Z" },
      ],
    },
    summary: (rows) => rows[0]?.meta?.name,
  },

  // Finance & Payments
  {
    key: "netsuite",
    name: "NetSuite",
    category: "finance",
    logo: <Monogram text="NS" bg="#1B3A57" />,
    description: "Invoices, vendor bills, customers and journal entries through SuiteTalk REST.",
    capabilities: ["Read-only SuiteQL queries", "Open invoices and vendor bills", "Create and update records (held for approval)"],
    keywords: "erp oracle accounting ledger ap ar",
    connect: {
      kind: "form",
      endpoint: "/netsuite/connect",
      help: "Create an integration record with Token-Based Authentication enabled, then an access token for a role with REST Web Services and SuiteAnalytics Workbook permissions.",
      fields: [
        { key: "accountId", label: "Account ID", type: "text", placeholder: "1234567 or 1234567_SB1", required: true },
        { key: "consumerKey", label: "Consumer key", type: "password", required: true },
        { key: "consumerSecret", label: "Consumer secret", type: "password", required: true },
        { key: "tokenId", label: "Token ID", type: "password", required: true },
        { key: "tokenSecret", label: "Token secret", type: "password", required: true },
      ],
    },
    summary: (rows) => rows[0]?.meta?.accountId && `Account ${rows[0].meta.accountId}`,
  },
  {
    key: "xero",
    name: "Xero",
    category: "finance",
    logo: <XeroIcon />,
    description: "Invoices, contacts, bank transactions and P&L reporting.",
    capabilities: ["Read and create invoices and contacts", "Bank transactions", "Profit & loss reports"],
    keywords: "accounting bookkeeping",
    connect: {
      kind: "form",
      endpoint: "/xero/connect",
      help: "Create a Custom Connection in the Xero developer portal for your organisation (accounting.transactions, accounting.contacts, accounting.settings and accounting.reports.read), then paste its client ID and secret.",
      fields: [
        { key: "clientId", label: "Client ID", type: "password", required: true },
        { key: "clientSecret", label: "Client secret", type: "password", required: true },
      ],
    },
    summary: (rows) => rows[0]?.meta?.tenantName,
  },
  {
    key: "stripe",
    name: "Stripe",
    category: "finance",
    logo: <StripeIcon />,
    description: "Customers, products, checkout sessions and refunds.",
    capabilities: ["Manage customers and products", "Create checkout sessions", "Issue refunds (held for approval)"],
    keywords: "payments billing",
    connect: {
      kind: "form",
      endpoint: "/stripe/connect",
      help: "Use a restricted key limited to what the AI needs.",
      fields: [
        { key: "apiKey", label: "Secret or restricted key", type: "password", placeholder: "sk_live_… / rk_live_…", required: true },
        { key: "webhookSecret", label: "Webhook signing secret (optional)", type: "password", placeholder: "whsec_…" },
      ],
      validate: (f) => (!/^(sk|rk)_/.test(f.apiKey || "") ? 'Stripe keys start with "sk_" or "rk_".' : null),
    },
  },

  // Risk & Compliance
  {
    key: "archive",
    platform: true, // a workspace control, not a tool the AI calls
    name: "Communications archive",
    category: "compliance",
    logo: <ArchiveGlyph />,
    description: "Capture every AI-sent email, Slack and Teams message in Smarsh, Global Relay or any journaling archive.",
    capabilities: ["BCC every AI-sent email to the archive", "Journal Slack and Teams posts before they send", "Block sending when capture fails"],
    keywords: "smarsh global relay mimecast proofpoint journaling recordkeeping 17a-4 finra mifid retention",
    connect: {
      kind: "form",
      endpoint: "/archive/connect",
      submitLabel: "Save archive",
      help: "Use the journaling address your archive provides. For Slack and Teams, allow Aisty's system mailbox as a journal sender.",
      fields: [
        { key: "vendor", label: "Archive", type: "select", initial: "smarsh", choices: [
          { value: "smarsh", label: "Smarsh" }, { value: "global_relay", label: "Global Relay" },
          { value: "mimecast", label: "Mimecast" }, { value: "proofpoint", label: "Proofpoint" }, { value: "other", label: "Other" },
        ] },
        { key: "journalAddress", label: "Journaling address", type: "text", placeholder: "journal@yourfirm.archive.com", required: true },
        { key: "required", label: "Block AI messages that cannot be captured", type: "checkbox", initial: true },
        { key: "sendTest", label: "Send a test message now", type: "checkbox", initial: true },
      ],
    },
    summary: (rows) => rows[0]?.meta?.journalAddress,
    security: "Enforced in the AI runtime, not by instruction: a message is only sent once its archive copy is guaranteed.",
  },
  {
    key: "complyadvantage",
    name: "ComplyAdvantage",
    category: "compliance",
    logo: <Monogram text="CA" bg="#0A2540" />,
    description: "Sanctions, PEP, watchlist and adverse-media screening for KYC and AML checks.",
    capabilities: ["Screen people and companies", "Review hits and screening history", "Turn on ongoing monitoring"],
    keywords: "kyc kyb aml sanctions pep adverse media screening",
    connect: {
      kind: "form",
      endpoint: "/complyadvantage/connect",
      fields: [{ key: "apiKey", label: "API key", type: "password", required: true }],
    },
    note: "The AI reports potential matches for your team to review. It cannot clear or dismiss a match.",
  },

  // Security & IT
  {
    key: "siem",
    platform: true, // a workspace control, not a tool the AI calls
    name: "SIEM export",
    category: "security",
    logo: <SiemGlyph />,
    description: "Stream the audit trail (user actions, AI approvals, DLP findings) to Splunk, Sentinel or Datadog.",
    capabilities: ["Every audit event, as it happens", "AI approval decisions and DLP findings", "Delivery errors surfaced here"],
    keywords: "splunk sentinel datadog logs soc audit",
    connect: {
      kind: "form",
      endpoint: "/siem/connect",
      submitLabel: "Send test event & connect",
      fields: [
        { key: "destination", label: "Destination", type: "select", initial: "splunk", choices: [
          { value: "splunk", label: "Splunk (HTTP Event Collector)" },
          { value: "sentinel", label: "Microsoft Sentinel (Logs Ingestion API)" },
          { value: "datadog", label: "Datadog" },
        ] },
        { key: "url", label: "HEC URL", type: "text", placeholder: "https://splunk.yourfirm.com:8088", required: true, showIf: (f) => f.destination === "splunk" },
        { key: "token", label: "HEC token", type: "password", required: true, showIf: (f) => f.destination === "splunk" },
        { key: "index", label: "Index (optional)", type: "text", showIf: (f) => f.destination === "splunk" },
        { key: "dceEndpoint", label: "Data collection endpoint", type: "text", placeholder: "https://…ingest.monitor.azure.com", required: true, showIf: (f) => f.destination === "sentinel" },
        { key: "dcrImmutableId", label: "DCR immutable ID", type: "text", placeholder: "dcr-…", required: true, showIf: (f) => f.destination === "sentinel" },
        { key: "streamName", label: "Stream name", type: "text", placeholder: "Custom-AistyAudit_CL", required: true, showIf: (f) => f.destination === "sentinel" },
        { key: "tenantId", label: "Entra tenant ID", type: "text", required: true, showIf: (f) => f.destination === "sentinel" },
        { key: "clientId", label: "App (client) ID", type: "text", required: true, showIf: (f) => f.destination === "sentinel" },
        { key: "clientSecret", label: "Client secret", type: "password", required: true, showIf: (f) => f.destination === "sentinel" },
        { key: "site", label: "Datadog site", type: "select", initial: "datadoghq.com", showIf: (f) => f.destination === "datadog", choices: [
          { value: "datadoghq.com", label: "US1" }, { value: "us3.datadoghq.com", label: "US3" }, { value: "us5.datadoghq.com", label: "US5" },
          { value: "datadoghq.eu", label: "EU" }, { value: "ap1.datadoghq.com", label: "AP1" }, { value: "ddog-gov.com", label: "US1-FED" },
        ] },
        { key: "apiKey", label: "API key", type: "password", required: true, showIf: (f) => f.destination === "datadog" },
      ],
    },
    summary: (rows) => {
      const m = rows[0]?.meta || {};
      return { splunk: "Splunk", sentinel: "Microsoft Sentinel", datadog: "Datadog" }[m.destination];
    },
    attention: (rows) => {
      const m = rows[0]?.meta || {};
      if (!m.lastErrorAt) return null;
      const recent = !m.lastDeliveredAt || new Date(m.lastErrorAt) > new Date(m.lastDeliveredAt);
      return recent ? `Last delivery failed: ${m.lastError}` : null;
    },
  },
  {
    key: "scim",
    platform: true, // a workspace control, not a tool the AI calls
    name: "Okta / Entra ID provisioning",
    category: "security",
    logo: <ScimGlyph />,
    description: "SCIM 2.0: joiners are invited and leavers lose access the moment your identity provider disables them.",
    capabilities: ["Automatic invites for assigned users", "Instant deprovisioning", "Owners and admins stay managed in Aisty"],
    keywords: "scim okta entra azure ad identity sso provisioning joiner leaver",
    connect: {
      kind: "form",
      endpoint: "/scim/connect",
      submitLabel: "Generate SCIM token",
      result: "scim",
      fields: [
        { key: "idp", label: "Identity provider", type: "select", initial: "okta", choices: [
          { value: "okta", label: "Okta" }, { value: "entra", label: "Microsoft Entra ID" },
        ] },
        { key: "defaultRole", label: "Role for provisioned users", type: "select", initial: "viewer", choices: [
          { value: "viewer", label: "Viewer" }, { value: "member", label: "Member" }, { value: "billing", label: "Billing" },
        ] },
      ],
    },
    summary: (rows) => rows[0]?.meta && `${rows[0].meta.idp === "entra" ? "Entra ID" : "Okta"} · token …${rows[0].meta.tokenHint || ""}`,
    reconnectLabel: "Rotate token",
    security: "The token is created on the server and returned encrypted to a one-time key held only by this page. Only its hash is stored.",
    note: "Turn off group push in your identity provider; only user provisioning is supported.",
  },
  {
    key: "servicenow",
    name: "ServiceNow",
    category: "security",
    logo: <Monogram text="SN" bg="#293E40" />,
    description: "Incidents, change requests and the knowledge base.",
    capabilities: ["Find, open and update incidents", "Work notes and caller comments", "Search knowledge and changes"],
    keywords: "itsm incident change service desk ticketing",
    connect: {
      kind: "form",
      endpoint: "/servicenow/connect",
      help: "Use a dedicated integration user with the itil role.",
      fields: [
        { key: "instance", label: "Instance", type: "text", placeholder: "yourfirm.service-now.com", required: true },
        { key: "authType", label: "Authentication", type: "select", initial: "basic", choices: [
          { value: "basic", label: "Username & password" }, { value: "apikey", label: "API key" },
        ] },
        { key: "username", label: "Username", type: "text", required: true, showIf: (f) => f.authType !== "apikey" },
        { key: "password", label: "Password", type: "password", required: true, showIf: (f) => f.authType !== "apikey" },
        { key: "apiKey", label: "API key", type: "password", required: true, showIf: (f) => f.authType === "apikey" },
      ],
    },
    summary: (rows) => rows[0]?.meta?.instance,
  },

  // Engineering
  {
    key: "github",
    name: "GitHub",
    category: "engineering",
    logo: <GitHubIcon />,
    description: "Repositories, pull requests, issues and project boards.",
    capabilities: ["Review pull requests", "Create and update issues", "Read code and project boards"],
    keywords: "git code repositories pull requests",
    connect: {
      kind: "form",
      endpoint: "/github/connect",
      fields: [
        { key: "accessToken", label: "Access token", type: "password", placeholder: "github_pat_…", required: true },
        { key: "ownerLogin", label: "Organisation login", type: "text", placeholder: "your-org", required: true },
      ],
    },
    summary: (rows) => rows[0]?.meta?.ownerLogin,
  },
  {
    key: "jira",
    name: "Jira",
    category: "engineering",
    logo: <JiraIcon />,
    description: "Jira issues on your Atlassian site. Confluence pages come with hosted Aisty.",
    capabilities: ["Search and read issues with JQL", "Create issues and comment", "Move issues between statuses"],
    keywords: "atlassian tickets wiki confluence",
    connect: {
      kind: "form",
      endpoint: "/jira/connect",
      help: "Create an API token at id.atlassian.com/manage-profile/security/api-tokens.",
      fields: [
        { key: "email", label: "Atlassian account email", type: "text", required: true },
        { key: "apiToken", label: "API token", type: "password", required: true },
        { key: "siteUrl", label: "Site", type: "text", placeholder: "yourfirm.atlassian.net", required: true },
      ],
    },
    summary: (rows) => rows[0]?.meta?.siteName || rows[0]?.meta?.siteUrl,
  },
];

// Token fields for refreshing a Gmail/Outlook mailbox connected with a pasted access token before app credentials and delegation were available.
export const EMAIL_TOKEN_FIELDS = [
  { key: "accessToken", label: "Access token", type: "password", required: true },
  { key: "refreshToken", label: "Refresh token (optional)", type: "password" },
  TOKEN_EXPIRY_FIELD,
  { key: "label", label: "Label (optional)", type: "text", placeholder: "e.g. Operations" },
  { key: "email", label: "Email address (only if it can't be detected)", type: "text" },
];

// Rows that belong to a connector but are not themselves "a connection" of it (tenant and delegation grants back Outlook/Gmail mailboxes).
export const GRANT_PROVIDERS = { outlook: "microsoft_tenant", gmail: "google_workspace" };

// Aisty Free ships five connectors; the rest of the hosted catalog is shown in place, locked, so a workspace sees exactly what upgrading adds.
export const CONNECTORS = ALL_CONNECTORS.map((c) => (FREE_INTEGRATIONS.has(c.key) ? c : { ...c, locked: true }));
