// HubSpot CRM through a private app token.
import { request, ProviderError } from "./http.js";

const hs = (ctx, path, opts = {}) => request(`https://api.hubapi.com${path}`, { ...opts, headers: { Authorization: `Bearer ${ctx.secrets.accessToken}` } });

export default {
  key: "hubspot",
  name: "HubSpot",
  fields: { secret: ["accessToken"], plain: [] },
  async connect({ accessToken }) {
    if (!accessToken) throw new ProviderError("Paste the private app access token.");
    const ctx = { secrets: { accessToken } };
    await hs(ctx, "/crm/v3/objects/contacts?limit=1");
    const account = await hs(ctx, "/account-info/v3/details").catch(() => null);
    return { meta: { portalId: account?.portalId || null }, secrets: { accessToken } };
  },
  tools: [
    {
      name: "hubspot_search_contacts", risk: "read",
      description: "Search HubSpot contacts by name, email or company.",
      parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } }, required: ["query"] },
      async run({ query, limit = 20 }, ctx) {
        const d = await hs(ctx, "/crm/v3/objects/contacts/search", { method: "POST", body: { query, limit, properties: ["firstname", "lastname", "email", "company", "lifecyclestage"] } });
        return d.results.map((r) => ({ id: r.id, ...r.properties }));
      },
    },
    {
      name: "hubspot_list_deals", risk: "read",
      description: "List deals with their stage, amount and close date.",
      parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50 } } },
      async run({ limit = 20 }, ctx) {
        const d = await hs(ctx, `/crm/v3/objects/deals?limit=${limit}&properties=dealname,dealstage,amount,closedate,pipeline`);
        return d.results.map((r) => ({ id: r.id, ...r.properties }));
      },
    },
    {
      name: "hubspot_create_contact", risk: "write",
      description: "Create a contact.",
      parameters: { type: "object", properties: { email: { type: "string" }, firstname: { type: "string" }, lastname: { type: "string" }, company: { type: "string" } }, required: ["email"] },
      async run(props, ctx) {
        const r = await hs(ctx, "/crm/v3/objects/contacts", { method: "POST", body: { properties: props } });
        return { id: r.id };
      },
    },
    {
      name: "hubspot_create_note", risk: "write",
      description: "Log a note against a contact.",
      parameters: { type: "object", properties: { contact_id: { type: "string" }, body: { type: "string" } }, required: ["contact_id", "body"] },
      async run({ contact_id, body }, ctx) {
        const r = await hs(ctx, "/crm/v3/objects/notes", {
          method: "POST",
          body: {
            properties: { hs_note_body: body, hs_timestamp: new Date().toISOString() },
            associations: [{ to: { id: contact_id }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
          },
        });
        return { id: r.id };
      },
    },
    {
      name: "hubspot_update_deal_stage", risk: "write",
      description: "Move a deal to another pipeline stage (use the stage's internal ID).",
      parameters: { type: "object", properties: { deal_id: { type: "string" }, dealstage: { type: "string" } }, required: ["deal_id", "dealstage"] },
      async run({ deal_id, dealstage }, ctx) {
        await hs(ctx, `/crm/v3/objects/deals/${encodeURIComponent(deal_id)}`, { method: "PATCH", body: { properties: { dealstage } } });
        return { ok: true };
      },
    },
  ],
};
