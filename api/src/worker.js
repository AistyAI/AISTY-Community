// Background work: AI jobs, recurring tickets and opt-in telemetry.
import { config } from "./config.js";
import { tx, one, query } from "./db.js";
import { claim, finish } from "./jobs.js";
import { audit } from "./audit.js";
import { lockCompany } from "./company.js";
import { planTicket, executeApproved, failTicket, Cancelled } from "./agent/runner.js";
import { suggestTickets } from "./agent/suggest.js";
import { spawnFromTemplate } from "./routes/recurring.js";
import { sendTelemetry } from "./routes/plan.js";

const running = new Set();

async function runJob(job, log) {
  try {
    let result = null;
    if (job.kind === "plan") await planTicket(job);
    else if (job.kind === "execute") await executeApproved(job);
    else if (job.kind === "suggest") result = await suggestTickets(job);
    await finish(job.id, { result });
  } catch (err) {
    if (err instanceof Cancelled) { await finish(job.id, { error: "cancelled" }); return; }
    log.warn({ jobId: job.id, kind: job.kind, err: err.message }, "job failed");
    await finish(job.id, { error: err.message.slice(0, 500) });
    await failTicket(job, err).catch((e) => log.error({ err: e.message }, "could not mark ticket failed"));
  }
}

async function pumpJobs(log) {
  const free = config.agent.concurrency - running.size;
  if (free <= 0) return;
  const jobs = await claim(free);
  for (const job of jobs) {
    running.add(job.id);
    runJob(job, log).finally(() => running.delete(job.id));
  }
}

async function pumpRecurring(log) {
  const company = await one("SELECT id, data FROM companies LIMIT 1");
  const due = (company?.data?.recurringTicketTemplates || []).filter((t) => t.enabled && t.nextRunAt && Date.parse(t.nextRunAt) <= Date.now());
  for (const candidate of due) {
    await tx(async (c) => {
      const locked = await lockCompany(c, company.id);
      const tpl = (locked.data.recurringTicketTemplates || []).find((t) => t.templateId === candidate.templateId);
      // Re-check under the lock: another replica may have just spawned it.
      if (!tpl?.enabled || Date.parse(tpl.nextRunAt) > Date.now()) return;
      const ticket = await spawnFromTemplate(c, company.id, locked.data, tpl);
      await audit({ companyId: company.id, action: "recurring.spawn", resource: "recurring_ticket", resourceId: tpl.templateId, metadata: { title: tpl.title, ticketId: ticket.ticketId } }, c);
    }).catch((err) => log.error({ err: err.message, templateId: candidate.templateId }, "recurring spawn failed"));
  }
}

async function pumpTelemetry(log) {
  const last = await one("SELECT value FROM app_settings WHERE key = 'telemetry_last_sent'");
  if (last && Date.now() - Date.parse(last.value.at) < 7 * 24 * 3600 * 1000) return;
  await query(
    "INSERT INTO app_settings (key, value) VALUES ('telemetry_last_sent', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [{ at: new Date().toISOString() }],
  );
  await sendTelemetry(log);
}

export function startWorker(log) {
  const every = (ms, fn) => {
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try { await fn(log); } catch (err) { log.error({ err: err.message }, "worker tick failed"); } finally { busy = false; }
    }, ms);
    timer.unref();
  };
  every(3000, pumpJobs);
  every(60_000, pumpRecurring);
  every(6 * 3600 * 1000, pumpTelemetry);
  // Clear expired cached sessions now and then.
  every(3600 * 1000, () => query("DELETE FROM session_cache WHERE expires_at < now()"));
}
