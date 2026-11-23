// Aisty Free: API, browser app and worker in one process.
import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import httpProxy from "@fastify/http-proxy";
import { config, assertConfig } from "./config.js";
import { migrate, pool } from "./db.js";
import { registerAuth } from "./auth.js";
import { startWorker } from "./worker.js";
import workspaceRoutes from "./routes/workspace.js";
import teamRoutes from "./routes/team.js";
import ticketRoutes from "./routes/tickets.js";
import recurringRoutes from "./routes/recurring.js";
import settingsRoutes from "./routes/settings.js";
import auditRoutes from "./routes/audit.js";
import planRoutes from "./routes/plan.js";
import chatRoutes from "./routes/chat.js";
import { ipAllowed } from "./ipAccess.js";

export async function buildApp({ logger = true } = {}) {
  const app = Fastify({
    logger: logger ? { level: config.logLevel } : false,
    bodyLimit: 1_048_576,
    trustProxy: true,
  });

  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });

  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Frame-Options", "DENY");
    if (req.url.startsWith("/api/") || req.url.startsWith("/auth/")) reply.header("Cache-Control", "no-store");
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, "request failed");
    reply.code(status).send({ error: status >= 500 ? "Something went wrong on the server." : err.message, ...(err.upgrade ? { upgrade: true } : {}) });
  });

  registerAuth(app);

  // Workspace IP allowlist, checked on every API and sign-in call except health checks.
  app.addHook("onRequest", async (req, reply) => {
    if (!(req.url.startsWith("/api/") || req.url.startsWith("/auth/")) || req.url.startsWith("/api/health")) return;
    if (!(await ipAllowed(req.ip))) {
      reply.code(403).send({ error: "This network is not on the workspace's allowed IP list." });
    }
  });

  await app.register(async (api) => {
    api.get("/health", async () => {
      await pool.query("SELECT 1");
      return { status: "ok", edition: "free" };
    });
    await api.register(workspaceRoutes);
    await api.register(teamRoutes);
    await api.register(ticketRoutes);
    await api.register(recurringRoutes);
    await api.register(settingsRoutes);
    await api.register(auditRoutes);
    await api.register(planRoutes);
    await api.register(chatRoutes);
  }, { prefix: "/api" });

  // The bundled Hanko service, on this origin so cookies and passkeys stay first-party.
  // Hanko rate-limits by X-Real-IP, so set it from the trusted client address and drop anything the client sent.
  await app.register(httpProxy, {
    upstream: config.identityUrl,
    prefix: "/auth",
    replyOptions: {
      rewriteRequestHeaders: (req, headers) => {
        const { "x-forwarded-for": _f, "x-forwarded-host": _h, "x-forwarded-proto": _p, "x-real-ip": _r, ...rest } = headers;
        return { ...rest, "x-real-ip": req.ip };
      },
    },
  });

  // The browser app, built into the same image.
  if (fs.existsSync(path.join(config.webRoot, "index.html"))) {
    await app.register(fastifyStatic, { root: config.webRoot });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/") || req.url.startsWith("/auth/") || req.method !== "GET") return reply.code(404).send({ error: "Not found." });
      return reply.header("Cache-Control", "no-cache").sendFile("index.html");
    });
  }
  return app;
}

async function main() {
  assertConfig();
  await migrate();
  const app = await buildApp();
  startWorker(app.log);
  await app.listen({ port: config.port, host: "0.0.0.0" });
  if (config.devAuth) app.log.warn("Development sign-in is ON (AISTY_DEV_AUTH). Never use this in production.");
}

if (process.argv[1]?.endsWith("server.js")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
