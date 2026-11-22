// Jira Cloud, on the connected Atlassian site.
import { request, ProviderError } from "./http.js";

const auth = (ctx) => `Basic ${Buffer.from(`${ctx.secrets.email}:${ctx.secrets.apiToken}`).toString("base64")}`;
const jira = (ctx, path, opts = {}) => request(`https://${ctx.meta.siteHost}${path}`, { ...opts, headers: { Authorization: auth(ctx) } });

// Atlassian Document Format: plain paragraphs are enough for agent output.
const adf = (text) => ({
  type: "doc", version: 1,
  content: String(text || "").split(/\n{2,}/).map((p) => ({ type: "paragraph", content: p.trim() ? [{ type: "text", text: p }] : [] })),
});
const plain = (node) => {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  return (node.content || []).map(plain).join(node.type === "paragraph" ? "" : "\n");
};
const KEY = { type: "string", description: "Issue key, e.g. OPS-123." };

export default {
  key: "jira",
  name: "Jira",
  fields: { secret: ["apiToken"], plain: ["email", "siteUrl"] },
  async connect({ email, apiToken, siteUrl }) {
    const host = String(siteUrl || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
    if (!/^[a-z0-9-]+\.atlassian\.net$/.test(host)) throw new ProviderError("Enter your Atlassian site, e.g. yourfirm.atlassian.net.");
    if (!email || !apiToken) throw new ProviderError("Email and API token are required.");
    const ctx = { secrets: { email, apiToken }, meta: { siteHost: host } };
    const me = await jira(ctx, "/rest/api/3/myself");
    return { meta: { siteHost: host, siteUrl: `https://${host}`, siteName: host, accountName: me.displayName }, secrets: { email, apiToken } };
  },
  tools: [
    {
      name: "jira_search", risk: "read",
      description: "Search Jira issues with JQL, e.g. \"project = OPS AND status != Done ORDER BY updated DESC\".",
      parameters: { type: "object", properties: { jql: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } }, required: ["jql"] },
      async run({ jql, limit = 20 }, ctx) {
        const data = await jira(ctx, "/rest/api/3/search/jql", { method: "POST", body: { jql, maxResults: limit, fields: ["summary", "status", "assignee", "priority", "updated", "issuetype"] } });
        return (data.issues || []).map((i) => ({ key: i.key, summary: i.fields.summary, status: i.fields.status?.name, type: i.fields.issuetype?.name, assignee: i.fields.assignee?.displayName, priority: i.fields.priority?.name, updated: i.fields.updated }));
      },
    },
    {
      name: "jira_get_issue", risk: "read",
      description: "Read a Jira issue with its description and recent comments.",
      parameters: { type: "object", properties: { key: KEY }, required: ["key"] },
      async run({ key }, ctx) {
        const i = await jira(ctx, `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,assignee,description,comment,priority,issuetype`);
        return {
          key: i.key, summary: i.fields.summary, status: i.fields.status?.name, assignee: i.fields.assignee?.displayName,
          description: plain(i.fields.description).slice(0, 6000),
          comments: (i.fields.comment?.comments || []).slice(-10).map((c) => ({ author: c.author?.displayName, body: plain(c.body).slice(0, 1500), at: c.created })),
        };
      },
    },
    {
      name: "jira_create_issue", risk: "write",
      description: "Create a Jira issue.",
      parameters: { type: "object", properties: { project_key: { type: "string" }, summary: { type: "string" }, description: { type: "string" }, issue_type: { type: "string", description: "Defaults to Task." } }, required: ["project_key", "summary"] },
      async run({ project_key, summary, description = "", issue_type = "Task" }, ctx) {
        const i = await jira(ctx, "/rest/api/3/issue", { method: "POST", body: { fields: { project: { key: project_key }, summary, issuetype: { name: issue_type }, description: adf(description) } } });
        return { key: i.key, url: `https://${ctx.meta.siteHost}/browse/${i.key}` };
      },
    },
    {
      name: "jira_add_comment", risk: "write",
      description: "Add a comment to a Jira issue.",
      parameters: { type: "object", properties: { key: KEY, body: { type: "string" } }, required: ["key", "body"] },
      async run({ key, body }, ctx) {
        await jira(ctx, `/rest/api/3/issue/${encodeURIComponent(key)}/comment`, { method: "POST", body: { body: adf(body) } });
        return { ok: true };
      },
    },
    {
      name: "jira_transition_issue", risk: "write",
      description: "Move a Jira issue to another status, e.g. \"In Progress\" or \"Done\".",
      parameters: { type: "object", properties: { key: KEY, status: { type: "string" } }, required: ["key", "status"] },
      async run({ key, status }, ctx) {
        const { transitions } = await jira(ctx, `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`);
        const t = transitions.find((x) => x.name.toLowerCase() === status.toLowerCase() || x.to?.name?.toLowerCase() === status.toLowerCase());
        if (!t) throw new ProviderError(`No transition to "${status}". Available: ${transitions.map((x) => x.to?.name || x.name).join(", ")}`);
        await jira(ctx, `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, { method: "POST", body: { transition: { id: t.id } } });
        return { ok: true, status: t.to?.name || t.name };
      },
    },
  ],
};
