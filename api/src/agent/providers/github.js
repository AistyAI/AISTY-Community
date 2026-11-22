// GitHub, scoped to the one organisation or user the token was connected for.
import { request, ProviderError } from "./http.js";

const API = "https://api.github.com";
const gh = (ctx, path, opts = {}) => request(`${API}${path}`, {
  ...opts,
  headers: { Authorization: `Bearer ${ctx.secrets.accessToken}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "aisty-free" },
});

const REPO = { type: "string", description: "Repository name within the connected organisation, e.g. \"website\"." };
const repoPath = (ctx, repo) => {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repo || "")) throw new ProviderError("Give a repository name, without the owner.");
  return `/repos/${encodeURIComponent(ctx.meta.ownerLogin)}/${encodeURIComponent(repo)}`;
};

export default {
  key: "github",
  name: "GitHub",
  fields: { secret: ["accessToken"], plain: ["ownerLogin"] },
  async connect({ accessToken, ownerLogin }) {
    if (!accessToken) throw new ProviderError("An access token is required.");
    if (!/^[A-Za-z0-9-]{1,39}$/.test(ownerLogin || "")) throw new ProviderError("Enter the organisation or user login.");
    const ctx = { secrets: { accessToken }, meta: { ownerLogin } };
    const user = await gh(ctx, "/user");
    return { meta: { ownerLogin, login: user.login }, secrets: { accessToken } };
  },
  tools: [
    {
      name: "github_list_repos", risk: "read",
      description: "List repositories in the connected GitHub organisation.",
      parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50 } } },
      async run({ limit = 30 }, ctx) {
        const owner = encodeURIComponent(ctx.meta.ownerLogin);
        const repos = await gh(ctx, `/orgs/${owner}/repos?per_page=${limit}&sort=updated`).catch(() => gh(ctx, `/users/${owner}/repos?per_page=${limit}&sort=updated`));
        return repos.map((r) => ({ name: r.name, description: r.description, private: r.private, updated: r.updated_at, openIssues: r.open_issues_count }));
      },
    },
    {
      name: "github_search_issues", risk: "read",
      description: "Search issues and pull requests in the connected organisation using GitHub search syntax, e.g. \"is:open label:bug\".",
      parameters: { type: "object", properties: { q: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } }, required: ["q"] },
      async run({ q, limit = 20 }, ctx) {
        const query = `${q} org:${ctx.meta.ownerLogin}`;
        const data = await gh(ctx, `/search/issues?q=${encodeURIComponent(query)}&per_page=${limit}`);
        return data.items.map((i) => ({ repo: i.repository_url.split("/").pop(), number: i.number, title: i.title, state: i.state, isPullRequest: Boolean(i.pull_request), labels: i.labels.map((l) => l.name), updated: i.updated_at }));
      },
    },
    {
      name: "github_get_issue", risk: "read",
      description: "Read an issue or pull request with its latest comments.",
      parameters: { type: "object", properties: { repo: REPO, issue_number: { type: "integer" } }, required: ["repo", "issue_number"] },
      async run({ repo, issue_number }, ctx) {
        const base = repoPath(ctx, repo);
        const [issue, comments] = await Promise.all([gh(ctx, `${base}/issues/${issue_number}`), gh(ctx, `${base}/issues/${issue_number}/comments?per_page=20`)]);
        return { title: issue.title, state: issue.state, body: issue.body, author: issue.user?.login, labels: issue.labels.map((l) => l.name), comments: comments.map((c) => ({ author: c.user?.login, body: c.body, at: c.created_at })) };
      },
    },
    {
      name: "github_list_pull_requests", risk: "read",
      description: "List pull requests in a repository.",
      parameters: { type: "object", properties: { repo: REPO, state: { type: "string", enum: ["open", "closed", "all"] } }, required: ["repo"] },
      async run({ repo, state = "open" }, ctx) {
        const prs = await gh(ctx, `${repoPath(ctx, repo)}/pulls?state=${state}&per_page=30`);
        return prs.map((p) => ({ number: p.number, title: p.title, author: p.user?.login, draft: p.draft, updated: p.updated_at }));
      },
    },
    {
      name: "github_get_file", risk: "read",
      description: "Read a text file from a repository.",
      parameters: { type: "object", properties: { repo: REPO, path: { type: "string" }, ref: { type: "string" } }, required: ["repo", "path"] },
      async run({ repo, path, ref }, ctx) {
        const clean = String(path).replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
        const f = await gh(ctx, `${repoPath(ctx, repo)}/contents/${clean}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
        if (Array.isArray(f)) return { directory: f.map((e) => ({ name: e.name, type: e.type })) };
        return { path: f.path, content: Buffer.from(f.content || "", "base64").toString("utf8").slice(0, 20000) };
      },
    },
    {
      name: "github_create_issue", risk: "write",
      description: "Create an issue in a repository.",
      parameters: { type: "object", properties: { repo: REPO, title: { type: "string" }, body: { type: "string" }, labels: { type: "array", items: { type: "string" } } }, required: ["repo", "title"] },
      async run({ repo, title, body = "", labels }, ctx) {
        const i = await gh(ctx, `${repoPath(ctx, repo)}/issues`, { method: "POST", body: { title, body, ...(labels?.length ? { labels } : {}) } });
        return { number: i.number, url: i.html_url };
      },
    },
    {
      name: "github_comment_issue", risk: "outbound",
      description: "Comment on an issue or pull request. Comments can be public, so this counts as sending something out.",
      parameters: { type: "object", properties: { repo: REPO, issue_number: { type: "integer" }, body: { type: "string" } }, required: ["repo", "issue_number", "body"] },
      async run({ repo, issue_number, body }, ctx) {
        const c = await gh(ctx, `${repoPath(ctx, repo)}/issues/${issue_number}/comments`, { method: "POST", body: { body } });
        return { url: c.html_url };
      },
    },
  ],
};
