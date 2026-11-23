// Runtime configuration.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Load a .env from the repo root for local runs.
for (const candidate of [path.resolve(here, "../../.env"), path.resolve(here, "../.env")]) {
  if (!fs.existsSync(candidate)) continue;
  for (const line of fs.readFileSync(candidate, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  break;
}

const env = (name, fallback) => (process.env[name] ?? "") === "" ? fallback : process.env[name];
const int = (name, fallback) => {
  const n = Number.parseInt(env(name, ""), 10);
  return Number.isFinite(n) ? n : fallback;
};

const isProduction = env("NODE_ENV", "development") === "production";

export const config = {
  isProduction,
  port: int("PORT", 8080),
  appUrl: env("APP_URL", "http://localhost:8080").replace(/\/+$/, ""),
  databaseUrl: env("DATABASE_URL", "postgres://aisty:aisty@localhost:5432/aisty"),
  databaseSsl: env("DATABASE_SSL", "false").toLowerCase() === "true",
  masterKey: env("MASTER_KEY", ""),
  // The Hanko sign-in service bundled in docker-compose.yml; the browser reaches it through /auth.
  identityUrl: env("AISTY_IDENTITY_URL", "http://hanko:8000").replace(/\/+$/, ""),
  // Local development only: accept "dev.<email>" tokens instead of a Hanko session.
  devAuth: !isProduction && env("AISTY_DEV_AUTH", "false").toLowerCase() === "true",
  sessionCacheSeconds: int("SESSION_CACHE_TTL_SECONDS", 300),
  bootstrapOwnerEmail: env("BOOTSTRAP_OWNER_EMAIL", "").toLowerCase(),
  webRoot: env("WEB_ROOT", path.resolve(here, "../../web/build")),
  agent: {
    maxSteps: int("AGENT_MAX_STEPS", 12),
    stepTimeoutMs: int("AGENT_STEP_TIMEOUT_MS", 180_000),
    concurrency: int("WORKER_CONCURRENCY", 3),
  },
  // How far back the Audit Trail can be viewed and exported.
  auditWindowDays: 90,
  telemetryUrl: env("AISTY_TELEMETRY_URL", "https://telemetry.aisty.ai/v1/free"),
  logLevel: env("LOG_LEVEL", "info"),
};

if (isProduction && process.env.AISTY_DEV_AUTH === "true") {
  // Loud rather than silent: someone tried to ship dev sign-in.
  console.error("AISTY_DEV_AUTH is ignored in production. Sign-in uses the Aisty Identity Service.");
}

export function assertConfig() {
  const key = Buffer.from(config.masterKey || "", "base64");
  if (key.length !== 32) {
    throw new Error("MASTER_KEY must be 32 random bytes, base64-encoded. Generate one with: openssl rand -base64 32");
  }
}
