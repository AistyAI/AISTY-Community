// Approval policy, the model connection and integrations.
import { tx, one, query } from "../db.js";
import { audit, fromRequest } from "../audit.js";
import { getSealingKey, openBrowserSealed, sealJson } from "../crypto.js";
import { HttpError, badRequest } from "../errors.js";
import { requireAdmin } from "../auth.js";
import { lockCompany, saveCompanyData } from "../company.js";
import { PROVIDERS as MODEL_PROVIDERS, chat } from "../agent/models.js";
import { loadModelConfig } from "../agent/plans.js";
import { PROVIDERS } from "../agent/providers/index.js";

const LEVELS = ["off", "critical", "medium", "all"];

function validBaseUrl(raw) {
  let url;
  try { url = new URL(String(raw || "").trim()); } catch { throw badRequest("Enter the endpoint's base URL, e.g. https://your-deployment.example/v1"); }
  if (!["http:", "https:"].includes(url.protocol)) throw badRequest("The endpoint must be an http or https URL.");
  if (url.username || url.password) throw badRequest("Put the API key in the key field, not the URL.");
  return url.toString().replace(/\/+$/, "");
}

export default async function settingsRoutes(app) {
  const pre = { preHandler: app.workspace };

  /* AI approval policy */

  app.get("/ai-approvals/policy", pre, async (req) => {
    const p = req.company.data?.aiApprovalPolicy || { level: "medium" };
    return { level: p.level || "medium", canEdit: ["owner", "admin"].includes(req.workspaceRole), updatedAt: p.updatedAt || null, updatedBy: p.updatedBy || null };
  });

  app.put("/ai-approvals/policy", pre, async (req) => {
    requireAdmin(req);
    const level = String(req.body?.level || "");
    if (!LEVELS.includes(level)) throw badRequest(`level must be one of ${LEVELS.join(", ")}.`);
    const policy = await tx(async (c) => {
      const company = await lockCompany(c, req.companyId);
      const before = company.data.aiApprovalPolicy?.level || "medium";
      company.data.aiApprovalPolicy = { level, updatedAt: new Date().toISOString(), updatedBy: req.user.email || req.user.userId };
      await saveCompanyData(c, req.companyId, company.data);
      await audit({ ...fromRequest(req), action: "ai_approval_policy.update", resource: "ai_approval_policy", metadata: { from: before, to: level } }, c);
      return company.data.aiApprovalPolicy;
    });
    return policy;
  });

  /* Model connection */

  app.get("/model", pre, async (req) => {
    const row = await one("SELECT provider, base_url, model, sealed_key IS NOT NULL AS has_key, updated_at, updated_by FROM model_config WHERE company_id = $1", [req.companyId]);
    return {
      configured: Boolean(row),
      provider: row?.provider || null,
      baseUrl: row?.base_url || "",
      model: row?.model || "",
      hasKey: Boolean(row?.has_key),
      updatedAt: row?.updated_at || null,
      updatedBy: row?.updated_by || null,
      canEdit: ["owner", "admin"].includes(req.workspaceRole),
      providers: Object.entries(MODEL_PROVIDERS).map(([key, p]) => ({ key, ...p })),
    };
  });

  app.put("/model", pre, async (req) => {
    requireAdmin(req);
    const provider = String(req.body?.provider || "");
    const spec = MODEL_PROVIDERS[provider];
    if (!spec) throw badRequest("Choose a model provider.");
    const model = String(req.body?.model || spec.defaultModel || "").trim();
    if (!model || model.length > 200) throw badRequest("Enter a model name.");
    const baseUrl = spec.needsBaseUrl ? validBaseUrl(req.body?.baseUrl) : null;

    const existing = await one("SELECT provider, sealed_key FROM model_config WHERE company_id = $1", [req.companyId]);
    let sealedKey = existing?.provider === provider ? existing.sealed_key : null;
    if (req.body?.sealed) {
      const fields = await openBrowserSealed(req.body.sealed, "model", req.companyId);
      const apiKey = String(fields.apiKey || "").trim();
      sealedKey = apiKey ? sealJson(apiKey, `model:${req.companyId}`) : null;
    }
    if (spec.keyRequired && !sealedKey) throw badRequest("This provider needs an API key.");

    await tx(async (c) => {
      await c.query(
        `INSERT INTO model_config (company_id, provider, base_url, model, sealed_key, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,now())
         ON CONFLICT (company_id) DO UPDATE SET provider = $2, base_url = $3, model = $4, sealed_key = $5, updated_by = $6, updated_at = now()`,
        [req.companyId, provider, baseUrl, model, sealedKey, req.user.email || req.user.userId],
      );
      await audit({ ...fromRequest(req), action: "model.connect", resource: "model", resourceId: provider, metadata: { provider, model, baseUrl } }, c);
    });
    return { message: "Model connected." };
  });

  app.post("/model/test", pre, async (req) => {
    requireAdmin(req);
    const cfg = await loadModelConfig(req.companyId);
    if (!cfg) throw badRequest("Save a model connection first.");
    const started = Date.now();
    try {
      const reply = await chat(cfg, {
        system: "Reply with one short sentence.",
        messages: [{ role: "user", content: "Say hello to the Aisty workspace and name the model you are." }],
        timeoutMs: 60_000,
      });
      return { ok: true, latencyMs: Date.now() - started, reply: reply.text.slice(0, 300) };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, error: err.message };
    }
  });

  /* Integrations */

  app.get("/integrations/sealing-key", pre, async () => {
    const k = await getSealingKey();
    return { alg: "RSA-OAEP-256", kid: k.kid, publicKey: k.publicKey };
  });

  app.post("/integrations/:provider/connect", pre, async (req) => {
    requireAdmin(req);
    const provider = PROVIDERS[req.params.provider];
    if (!provider) throw new HttpError(402, "This integration is part of hosted Aisty.", { upgrade: true });
    const secret = req.body?.sealed ? await openBrowserSealed(req.body.sealed, provider.key, req.companyId) : {};
    const plain = Object.fromEntries(provider.fields.plain.map((k) => [k, typeof req.body?.[k] === "string" ? req.body[k].trim() : secret[k]]));
    let connected;
    try {
      connected = await provider.connect({ ...secret, ...plain });
    } catch (err) {
      throw badRequest(err.message);
    }
    await tx(async (c) => {
      await c.query(
        `INSERT INTO integrations (company_id, provider, meta, sealed, connected_by) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (company_id, provider) DO UPDATE SET meta = $3, sealed = $4, connected_by = $5, updated_at = now()`,
        [req.companyId, provider.key, connected.meta, sealJson(connected.secrets, `integration:${req.companyId}:${provider.key}`), req.user.email || req.user.userId],
      );
      await audit({ ...fromRequest(req), action: "integration.connect", resource: provider.key, metadata: { provider: provider.key } }, c);
    });
    return { message: `${provider.name} connected.` };
  });

  app.post("/integrations/:provider/disconnect", pre, async (req) => {
    requireAdmin(req);
    const { rowCount } = await query("DELETE FROM integrations WHERE company_id = $1 AND provider = $2", [req.companyId, req.params.provider]);
    if (rowCount) await audit({ ...fromRequest(req), action: "integration.disconnect", resource: req.params.provider, metadata: { provider: req.params.provider } });
    return { message: "Disconnected." };
  });
}
