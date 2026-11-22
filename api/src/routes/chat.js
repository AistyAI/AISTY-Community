// Chat history and messages, in the shape the Aisty chat screens read.
import crypto from "node:crypto";
import { query, one, tx } from "../db.js";
import { sealJson, openJson } from "../crypto.js";
import { HttpError, notFound, badRequest } from "../errors.js";
import { text } from "../company.js";
import { respond } from "../agent/chat.js";
import { ModelError } from "../agent/models.js";

const id = () => crypto.randomUUID();

const chatView = (r) => ({
  chatId: r.chat_id, title: r.title, createdBy: r.created_by_email || r.created_by,
  parentChatId: r.parent_chat_id, createdAt: r.created_at, updatedAt: r.updated_at,
});

function messageView(r) {
  const body = openJson(r.body, `chat-message:${r.message_id}`) || {};
  return { _id: r.message_id, role: r.role, content: body.content || "", steps: body.steps || [], createdAt: r.created_at, feedback: r.feedback || null };
}

async function ownChat(req, chatId) {
  const chat = await one("SELECT * FROM chats WHERE chat_id = $1 AND company_id = $2 AND created_by = $3", [chatId, req.companyId, req.user.userId]);
  if (!chat) throw notFound("Chat not found.");
  return chat;
}

async function insertMessage(c, chatId, role, content, steps = []) {
  const messageId = id();
  const { rows } = await c.query(
    "INSERT INTO chat_messages (message_id, chat_id, role, body) VALUES ($1,$2,$3,$4) RETURNING *",
    [messageId, chatId, role, sealJson({ content, steps }, `chat-message:${messageId}`)],
  );
  await c.query("UPDATE chats SET updated_at = now() WHERE chat_id = $1", [chatId]);
  return messageView(rows[0]);
}

async function history(chatId) {
  const { rows } = await query("SELECT * FROM chat_messages WHERE chat_id = $1 ORDER BY seq", [chatId]);
  return rows.map(messageView);
}

async function answer(req, chatId) {
  const msgs = await history(chatId);
  let reply;
  try {
    reply = await respond({ companyId: req.companyId, user: req.user, history: msgs.slice(-30) });
  } catch (err) {
    reply = { content: err instanceof ModelError ? err.message : "Something went wrong while answering. Try again.", steps: [] };
  }
  return tx((c) => insertMessage(c, chatId, "assistant", reply.content, reply.steps));
}

export default async function chatRoutes(app) {
  const pre = { preHandler: app.workspace };

  app.get("/chats", pre, async (req) => {
    const { rows } = await query(
      "SELECT * FROM chats WHERE company_id = $1 AND created_by = $2 ORDER BY updated_at DESC LIMIT 200",
      [req.companyId, req.user.userId],
    );
    return rows.map(chatView);
  });

  app.post("/chats", pre, async (req, reply) => {
    const title = text(req.body?.title || "New Chat", "Title", { max: 200 }) || "New Chat";
    const { rows } = await query(
      "INSERT INTO chats (chat_id, company_id, created_by, created_by_email, title) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [id(), req.companyId, req.user.userId, req.user.email, title],
    );
    reply.code(201);
    return chatView(rows[0]);
  });

  app.delete("/chats/:chatId", pre, async (req) => {
    await ownChat(req, req.params.chatId);
    await query("DELETE FROM chats WHERE chat_id = $1", [req.params.chatId]);
    return { message: "Chat deleted." };
  });

  app.get("/chats/:chatId/messages", pre, async (req) => {
    await ownChat(req, req.params.chatId);
    return { messages: await history(req.params.chatId) };
  });

  app.post("/chats/:chatId/messages", pre, async (req) => {
    await ownChat(req, req.params.chatId);
    const content = text(req.body?.content, "Message", { max: 20000, required: true, multiline: true });
    const userMessage = await tx((c) => insertMessage(c, req.params.chatId, "user", content));
    const assistantMessage = await answer(req, req.params.chatId);
    return { userMessage, assistantMessage };
  });

  app.post("/chats/:chatId/messages/:messageId/feedback", pre, async (req) => {
    await ownChat(req, req.params.chatId);
    const vote = req.body?.vote;
    if (!["up", "down"].includes(vote)) throw badRequest("vote must be up or down.");
    const comment = text(req.body?.comment, "Comment", { max: 2000, multiline: true });
    const { rowCount } = await query(
      "UPDATE chat_messages SET feedback = $3 WHERE message_id = $1 AND chat_id = $2 AND role = 'assistant'",
      [req.params.messageId, req.params.chatId, JSON.stringify({ vote, comment, at: new Date().toISOString() })],
    );
    if (!rowCount) throw notFound("Message not found.");
    return { ok: true };
  });

  // Editing a message forks the conversation rather than rewriting it.
  app.post("/chats/:chatId/messages/:messageId/edit", pre, async (req) => {
    const chat = await ownChat(req, req.params.chatId);
    const newContent = text(req.body?.newContent, "Message", { max: 20000, required: true, multiline: true });
    const msgs = await history(chat.chat_id);
    const idx = msgs.findIndex((m) => m._id === req.params.messageId && m.role === "user");
    if (idx < 0) throw notFound("Message not found.");
    const fork = await tx(async (c) => {
      const { rows } = await c.query(
        "INSERT INTO chats (chat_id, company_id, created_by, created_by_email, title, parent_chat_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        [id(), req.companyId, req.user.userId, req.user.email, chat.title, chat.chat_id],
      );
      for (const m of msgs.slice(0, idx)) await insertMessage(c, rows[0].chat_id, m.role, m.content, m.steps);
      await insertMessage(c, rows[0].chat_id, "user", newContent);
      return rows[0];
    });
    await answer(req, fork.chat_id);
    return { newChat: chatView(fork), messages: await history(fork.chat_id) };
  });

  app.post("/chats/:chatId/messages/upload", pre, async () => {
    throw new HttpError(402, "Files in chat use Company Brain, which comes with hosted Aisty.", { upgrade: true });
  });
}
