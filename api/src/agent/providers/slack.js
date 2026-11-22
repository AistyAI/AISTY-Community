// Slack, as the workspace's own bot.
import { request, ProviderError, AI_DISCLOSURE } from "./http.js";

async function slack(ctx, method, params = {}, post = false) {
  const url = `https://slack.com/api/${method}${post ? "" : `?${new URLSearchParams(params)}`}`;
  const data = await request(url, {
    method: post ? "POST" : "GET",
    headers: { Authorization: `Bearer ${ctx.secrets.botToken}` },
    ...(post ? { body: params } : {}),
  });
  if (!data?.ok) throw new ProviderError(`Slack refused ${method}: ${data?.error || "unknown error"}`);
  return data;
}

export default {
  key: "slack",
  name: "Slack",
  fields: { secret: ["botToken"], plain: [] },
  async connect({ botToken }) {
    if (!/^xoxb-/.test(botToken || "")) throw new ProviderError("Paste the Bot User OAuth Token (it starts with xoxb-).");
    const ctx = { secrets: { botToken } };
    const who = await slack(ctx, "auth.test");
    return { meta: { teamName: who.team, botUser: who.user }, secrets: { botToken } };
  },
  tools: [
    {
      name: "slack_list_channels", risk: "read",
      description: "List public and private channels the Aisty bot can see.",
      parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 200 } } },
      async run({ limit = 100 }, ctx) {
        const d = await slack(ctx, "conversations.list", { limit: String(limit), exclude_archived: "true", types: "public_channel,private_channel" });
        return d.channels.map((c) => ({ id: c.id, name: c.name, isMember: c.is_member, topic: c.topic?.value }));
      },
    },
    {
      name: "slack_read_channel", risk: "read",
      description: "Read recent messages from a channel the bot is a member of.",
      parameters: { type: "object", properties: { channel: { type: "string", description: "Channel ID, e.g. C0123456." }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["channel"] },
      async run({ channel, limit = 30 }, ctx) {
        const d = await slack(ctx, "conversations.history", { channel, limit: String(limit) });
        return d.messages.map((m) => ({ user: m.user || m.bot_id, text: m.text, ts: m.ts, threadReplies: m.reply_count || 0 }));
      },
    },
    {
      name: "slack_post_message", risk: "outbound",
      description: "Post a message to a channel, or reply in a thread.",
      parameters: { type: "object", properties: { channel: { type: "string", description: "Channel ID." }, text: { type: "string" }, thread_ts: { type: "string" } }, required: ["channel", "text"] },
      async run({ channel, text, thread_ts }, ctx) {
        const d = await slack(ctx, "chat.postMessage", { channel, text: `${text}\n\n_${AI_DISCLOSURE}_`, ...(thread_ts ? { thread_ts } : {}) }, true);
        return { ok: true, ts: d.ts, channel: d.channel };
      },
    },
  ],
};
