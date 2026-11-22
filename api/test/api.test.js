// End-to-end API test against a real Postgres.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { webcrypto } from "node:crypto";

if (!process.env.TEST_DATABASE_URL) {
  console.log("TEST_DATABASE_URL not set; skipping API tests.");
  process.exit(0);
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.AISTY_DEV_AUTH = "true";
process.env.NODE_ENV = "test";

const { buildApp } = await import("../src/server.js");
const { migrate, pool, query } = await import("../src/db.js");
const { claim, finish } = await import("../src/jobs.js");
const { planTicket, executeApproved } = await import("../src/agent/runner.js");
const { suggestTickets } = await import("../src/agent/suggest.js");
const { sealJson } = await import("../src/crypto.js");

let app;
let modelServer;
let modelUrl;
const modelScript = [];
const githubCalls = [];

const token = (email) => `dev.${Buffer.from(email).toString("base64url")}`;
const OWNER = token("owner@example.com");
const VIEWER = token("viewer@example.com");

async function call(method, url, { as = OWNER, body } = {}) {
  const res = await app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${as}` }, ...(body !== undefined ? { payload: body } : {}) });
  let json = null;
  try { json = res.json(); } catch { /* csv etc */ }
  return { status: res.statusCode, body: json, text: res.body };
}

// Mirror of web/src/components/integrations/sealing.js.
async function sealLikeBrowser(info, provider, companyId, fields) {
  const s = webcrypto.subtle;
  const enc = (t) => new TextEncoder().encode(t);
  const key = await s.importKey("spki", Buffer.from(info.publicKey, "base64"), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const aes = await s.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await s.encrypt({ name: "AES-GCM", iv, additionalData: enc(`${provider}:${companyId}`) }, aes, enc(JSON.stringify({ iat: Date.now(), fields })));
  const wrapped = await s.encrypt({ name: "RSA-OAEP" }, key, await s.exportKey("raw", aes));
  const b64 = (b) => Buffer.from(b).toString("base64");
  return { v: 1, alg: info.alg, kid: info.kid, key: b64(wrapped), iv: b64(iv), ct: b64(ct) };
}

async function runQueuedJobs() {
  for (let i = 0; i < 10; i++) {
    const jobs = await claim(10);
    if (!jobs.length) return;
    for (const job of jobs) {
      if (job.kind === "plan") await planTicket(job);
      if (job.kind === "execute") await executeApproved(job);
      if (job.kind === "suggest") { await finish(job.id, { result: await suggestTickets(job) }); continue; }
      await finish(job.id);
    }
  }
}

before(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate();

  modelServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const next = modelScript.shift() || { content: "Done." };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: next.content || null, tool_calls: next.tool_calls } }] }));
    });
  });
  await new Promise((r) => modelServer.listen(0, "127.0.0.1", r));
  modelUrl = `http://127.0.0.1:${modelServer.address().port}/v1`;

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith("https://api.github.com")) return realFetch(url, opts);
    githubCalls.push({ url: u, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
    const reply = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.endsWith("/user")) return reply({ login: "octo" });
    if (u.includes("/search/issues")) return reply({ items: [{ repository_url: "https://api.github.com/repos/acme/web", number: 7, title: "Login broken", state: "open", labels: [], updated_at: "2026-11-20" }] });
    if (u.endsWith("/repos/acme/web/issues") && opts.method === "POST") return reply({ number: 8, html_url: "https://github.com/acme/web/issues/8" });
    return new Response("not found", { status: 404 });
  };

  app = await buildApp({ logger: false });
});

after(async () => {
  await app?.close();
  modelServer?.close();
  await pool.end();
});

let companyId;
let ticketId;

test("first sign-in creates the workspace and its owner", async () => {
  const pre = await call("GET", "/me/workspace");
  assert.equal(pre.body.status, "needs_onboarding");
  const created = await call("POST", "/onboarding/company", {
    body: { companyName: "acme", description: "Widgets", goals: [{ title: "Ship faster" }], kpis: [{ name: "Revenue", history: [{ value: 1 }] }], tickets: [] },
  });
  assert.equal(created.status, 201);
  companyId = created.body.companyId;
  const again = await call("POST", "/onboarding/company", { body: { companyName: "second" } });
  assert.equal(again.status, 409, "one workspace per deployment");
  const me = await call("GET", "/company/me");
  assert.equal(me.body.workspaceRole, "owner");
  assert.equal(me.body.company.goals[0].title, "Ship faster");
});

test("a stranger is refused", async () => {
  const res = await call("GET", "/company/me", { as: token("stranger@example.com") });
  assert.equal(res.status, 403);
  const noToken = await app.inject({ method: "GET", url: "/api/company/me" });
  assert.equal(noToken.statusCode, 401);
});

test("model and integration credentials are sealed in transit", async () => {
  const model = await call("PUT", "/model", { body: { provider: "openai-compatible", baseUrl: modelUrl, model: "stub" } });
  assert.equal(model.status, 200, JSON.stringify(model.body));
  const info = (await call("GET", "/integrations/sealing-key")).body;
  const sealed = await sealLikeBrowser(info, "github", companyId, { accessToken: "ghp_test" });
  const connect = await call("POST", "/integrations/github/connect", { body: { companyId, ownerLogin: "acme", sealed } });
  assert.equal(connect.status, 200, JSON.stringify(connect.body));
  const row = (await query("SELECT sealed FROM integrations WHERE provider = 'github'")).rows[0];
  assert.ok(!row.sealed.includes("ghp_test"), "token stored sealed");
  const locked = await call("POST", "/integrations/xero/connect", { body: { companyId } });
  assert.equal(locked.status, 402, "paid integrations are refused");
});

test("a held plan runs exactly what was approved", async () => {
  await call("PUT", "/ai-approvals/policy", { body: { level: "medium" } });
  const save = await call("PUT", "/company/me", { body: { tickets: [{ ticketId: "t-1", title: "Triage login bug", description: "Open an issue", status: "open" }] } });
  assert.equal(save.status, 200, JSON.stringify(save.body));
  ticketId = "t-1";

  modelScript.push(
    { tool_calls: [{ id: "c1", type: "function", function: { name: "github_search_issues", arguments: JSON.stringify({ q: "is:open login" }) } }] },
    { tool_calls: [{ id: "c2", type: "function", function: { name: "github_create_issue", arguments: JSON.stringify({ repo: "web", title: "Fix login" }) } }] },
    { content: "Found #7. I propose opening an issue to fix login." },
  );
  const approve = await call("POST", `/tickets/${ticketId}/approve`);
  assert.equal(approve.status, 200);
  await runQueuedJobs();

  let ticket = (await call("GET", "/company/me")).body.company.tickets.find((t) => t.ticketId === ticketId);
  assert.equal(ticket.status, "awaiting_approval");
  assert.ok(!githubCalls.some((c) => c.method === "POST"), "nothing written before approval");

  const card = await call("GET", `/tickets/${ticketId}/approvals/${ticket.pendingApproval.approvalId}`);
  assert.equal(card.body.approval.steps[0].args.title, "Fix login");

  const denied = await call("POST", `/tickets/${ticketId}/approvals/${ticket.pendingApproval.approvalId}`, { as: VIEWER, body: { decision: "approve" } });
  assert.equal(denied.status, 403);

  const ok = await call("POST", `/tickets/${ticketId}/approvals/${ticket.pendingApproval.approvalId}`, { body: { decision: "approve" } });
  assert.equal(ok.body.status, "approved");
  modelScript.push({ content: "Opened https://github.com/acme/web/issues/8." });
  await runQueuedJobs();

  ticket = (await call("GET", "/company/me")).body.company.tickets.find((t) => t.ticketId === ticketId);
  assert.equal(ticket.status, "completed");
  assert.match(ticket.responses.at(-1).text, /issues\/8/);
  const post = githubCalls.find((c) => c.method === "POST");
  assert.deepEqual(post.body, { title: "Fix login", body: "" });

  const twice = await call("POST", `/tickets/${ticketId}/approvals/${card.body.approval.approvalId}`, { body: { decision: "approve" } });
  assert.equal(twice.status, 409, "a plan is decided once");
});

test("suggestions come back as goals with tickets", async () => {
  modelScript.push({ content: '```json\n{"goals":[{"isNew":true,"title":"Reduce churn","tickets":[{"title":"Email lapsed users","description":"Draft emails"}]}]}\n```' });
  const { body } = await call("POST", "/tickets/suggest");
  await runQueuedJobs();
  const job = await call("GET", `/jobs/${body.jobId}`);
  assert.equal(job.body.status, "complete");
  assert.equal(job.body.data.goals[0].tickets[0].title, "Email lapsed users");
});

test("invites, roles and the audit trail", async () => {
  const inv = await call("POST", "/team/invite", { body: { email: "viewer@example.com", role: "viewer" } });
  assert.equal(inv.status, 201);
  const inviteToken = new URL(inv.body.inviteUrl).searchParams.get("token");
  const wrong = await call("POST", "/invite/accept", { as: token("other@example.com"), body: { token: inviteToken } });
  assert.equal(wrong.status, 403, "invite is bound to its email");
  const acc = await call("POST", "/invite/accept", { as: VIEWER, body: { token: inviteToken } });
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
  const viewerSave = await call("PUT", "/company/me", { as: VIEWER, body: { tickets: [] } });
  assert.equal(viewerSave.status, 403, "viewers cannot change the board");

  const auditRes = await call("GET", "/audit?scope=aisty_link");
  assert.ok(auditRes.body.rows.some((r) => r.action === "ai.tool.executed" && r.metadata.tool === "github_create_issue" && r.metadata.approvalMode === "human"));
  const verify = await call("GET", "/plan/audit-verify");
  assert.equal(verify.body.ok, true);
  await assert.rejects(query("UPDATE audit_log SET action = 'x'"), /append-only/);
  const csv = await call("GET", "/audit/export?from=2020-01-01&to=2100-01-01");
  assert.match(csv.text, /ai\.tool\.executed/);

  const exp = await call("GET", "/plan/export");
  assert.equal(exp.body.format, "aisty-free-export");
  assert.equal(exp.body.audit.chainVerified, true);
  assert.ok(!JSON.stringify(exp.body).includes("ghp_test"), "no credentials in the export");

  // Free reads and exports the last 90 days. Older rows stay in the log.
  assert.equal(auditRes.body.window.days, 90);
  const companyId = (await query("SELECT id FROM companies LIMIT 1")).rows[0].id;
  const last = (await query("SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1")).rows[0].hash;
  await query(
    `INSERT INTO audit_log (id, company_id, action, metadata, created_at, prev_hash, hash)
     VALUES (gen_random_uuid(), $1, 'test.ancient', $2, now() - interval '200 days', $3, $4)`,
    [companyId, sealJson({}, "audit:old"), last, "f".repeat(64)],
  );
  const windowed = await call("GET", "/audit?limit=500");
  assert.equal(windowed.body.window.olderEntries, 1, "the old row is counted, not shown");
  assert.ok(windowed.body.rows.every((r) => Date.parse(r.createdAt) >= Date.parse(windowed.body.window.since)));
  const oldCsv = await app.inject({ method: "GET", url: "/api/audit/export?from=2020-01-01&to=2100-01-01", headers: { authorization: `Bearer ${OWNER}` } });
  assert.ok(oldCsv.headers["x-aisty-audit-window-start"], "a clamped export says so");
  assert.ok(!oldCsv.body.includes("test.ancient"), "nothing older than the window is exported");
  assert.equal((await query("SELECT count(*)::int AS n FROM audit_log WHERE created_at < now() - interval '100 days'")).rows[0].n, 1, "nothing is deleted");
});

test("chat answers with read-only look-ups and never writes", async () => {
  const chatRes = await call("POST", "/chats", { body: { title: "Bugs" } });
  assert.equal(chatRes.status, 201);
  const chatId = chatRes.body.chatId;
  modelScript.push(
    { tool_calls: [{ id: "k1", type: "function", function: { name: "github_search_issues", arguments: JSON.stringify({ q: "is:open" }) } }] },
    { content: "There is one open login bug, #7." },
  );
  const posts = githubCalls.filter((c) => c.method === "POST").length;
  const sent = await call("POST", `/chats/${chatId}/messages`, { body: { content: "Any open bugs?" } });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.match(sent.body.assistantMessage.content, /#7/);
  assert.equal(sent.body.assistantMessage.steps[0].tool, "github_search_issues");
  assert.equal(githubCalls.filter((c) => c.method === "POST").length, posts, "chat made no writes");
  const other = await call("GET", `/chats/${chatId}/messages`, { as: VIEWER });
  assert.equal(other.status, 404, "chats are private to their author");
  const list = await call("GET", "/chats");
  assert.equal(list.body[0].chatId, chatId);
});

test("Run as task creates an approved ticket and queues it", async () => {
  const res = await call("POST", "/tickets/submit", { body: { ticket: { ticketId: "chat-1", title: "Open a login issue", description: "From chat" } } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const t = (await call("GET", "/company/me")).body.company.tickets.find((x) => x.ticketId === "chat-1");
  assert.equal(t.approved, true);
  assert.equal(t.status, "in_progress");
  await query("UPDATE jobs SET status = 'cancelled' WHERE ticket_id = 'chat-1'");
});

test("IP allowlist refuses a list that locks out its author, then enforces", async () => {
  const lockout = await call("PUT", "/company/me", { body: { allowedIps: ["203.0.113.0/24"] } });
  assert.equal(lockout.status, 400);
  assert.match(lockout.body.error, /lock you out/);
  const bad = await call("PUT", "/company/me", { body: { allowedIps: ["not-an-ip"] } });
  assert.equal(bad.status, 400);
  const ok = await call("PUT", "/company/me", { body: { allowedIps: ["127.0.0.1", "203.0.113.0/24"] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const blocked = await app.inject({ method: "GET", url: "/api/company/me", remoteAddress: "198.51.100.9", headers: { authorization: `Bearer ${OWNER}` } });
  assert.equal(blocked.statusCode, 403);
  const inRange = await app.inject({ method: "GET", url: "/api/company/me", remoteAddress: "203.0.113.77", headers: { authorization: `Bearer ${OWNER}` } });
  assert.equal(inRange.statusCode, 200);
  const health = await app.inject({ method: "GET", url: "/api/health", remoteAddress: "198.51.100.9" });
  assert.equal(health.statusCode, 200, "health checks stay reachable");
  await call("PUT", "/company/me", { body: { allowedIps: [] } });
});
