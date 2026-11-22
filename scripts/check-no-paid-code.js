#!/usr/bin/env node
// Fails if hosted-only Aisty code has crept into Aisty Free.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const FORBIDDEN_FILES = [
  "web/src/components/user/Home.js",
  "web/src/components/files",
  "web/src/components/billing",
  "web/src/components/user/InsightsPage.js",
  "web/src/components/user/WorkspaceHub.js",
  "web/src/components/user/LinkConnect.js",
  "web/src/components/user/AistyLinkSettings.js",
  "web/src/components/user/EnterpriseSettings.js",
  "web/src/components/user/SystemStatus.js",
  "web/src/components/utils/ContentCredentialBadge.js",
  "web/src/components/utils/RequireSubscription.js",
  "web/src/components/integrations/EmailConnector.js",
  "web/src/components/integrations/TeamsConnector.js",
  "web/server.js",
  "web/licenseGate.js",
];

const FORBIDDEN_TEXT = [
  [/@onetoinfinity\/ui-library/, "the old UI library"],
  [/@stripe\//, "Stripe billing"],
  [/CLOUD_SCW_|scaleway_secrets/i, "hosted secret management"],
  [/x-workflows-token|WORKFLOWS_SHARED_SECRET/i, "hosted service credentials"],
  [/hyperstack/i, "hosted provisioning"],
  [/finetune|lora_adapter|graph_rag|knowledge_graph/i, "hosted AI internals"],
];

const SKIP_DIRS = new Set(["node_modules", "build", ".git"]);
const problems = [];

for (const rel of FORBIDDEN_FILES) {
  if (fs.existsSync(path.join(root, rel))) problems.push(`${rel} must not exist in Aisty Free`);
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|jsx|ts|tsx|css|json|sql|yml)$/.test(entry.name) && !/package-lock\.json$/.test(entry.name) && full !== __filename) {
      const text = fs.readFileSync(full, "utf8");
      for (const [re, what] of FORBIDDEN_TEXT) {
        if (re.test(text)) problems.push(`${path.relative(root, full)} references ${what} (${re})`);
      }
    }
  }
}
walk(path.join(root, "web", "src"));
walk(path.join(root, "api", "src"));

if (problems.length) {
  console.error("Hosted-only code found in Aisty Free:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("No hosted-only code found.");
