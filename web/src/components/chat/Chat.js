import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import "../../styles/chat/messages.css";
import "../../styles/chat/composer.css";
import "../../styles/chat/correction.css";
import "../../styles/chat/tools.css";
import { copyWithCredential, downloadWithCredential } from "../utils/aiProvenance";
import { getSessionUserId, authorizedFetch } from '../utils/verifiedCall';
import { useWorkspaceRole } from '../utils/WorkspaceRoleContext';
import { API_URL } from "./constants";
import useChatFeedback from "./useChatFeedback";
import ChatEmpty from "./ChatEmpty";
import MessageList from "./MessageList";
import ChatComposer from "./ChatComposer";
import CorrectionModal from "./CorrectionModal";

export default function Chat() {
  const [searchParams] = useSearchParams();
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [taskStatuses, setTaskStatuses] = useState({});   // messageId → { status, runId }
  const [decidingApproval, setDecidingApproval] = useState(null); // approvalId in flight
  const messagesEndRef = useRef(null);
  const sendingRef = useRef(false);

  // Use company data from shared context instead of fetching again
  const { companyData } = useWorkspaceRole();

  // Resolve Hanko user ID (from the session token) on mount
  useEffect(() => {
    getSessionUserId().then((id) => { if (id) setUserId(id); });
  }, []);

  // Load selected chat messages: use stable IDs to avoid re-creating this callback
  const companyIdRef = useRef(null);
  const userIdRef = useRef(null);
  companyIdRef.current = companyData?._id || null;
  userIdRef.current = userId;

  const loadMessages = useCallback(async (cid) => {
    if (!cid) return;
    const resp = await authorizedFetch(`${API_URL}/chats/${cid}/messages`, {
      credentials: "include",
      headers: {
        ...(companyIdRef.current ? { "x-company-id": companyIdRef.current } : {}),
        ...(userIdRef.current ? { "x-user-id": userIdRef.current } : {}),
      },
    });
    if (resp.ok) {
      const data = await resp.json();
      setMessages(data.messages);
      setChatId(cid);
    }
  }, []);

  // On mount: open chat from ?id= param once userId and companyData are available
  useEffect(() => {
    const idFromParams = searchParams.get("id");
    if (idFromParams && userId && companyData) {
      loadMessages(idFromParams);
    }
    // Only run when userId or companyData become available
  }, [userId, companyData, loadMessages, searchParams]);

  // Send message (lazily creates the chat on first send)
  const sendMessage = async () => {
    if (!input.trim() && attachedFiles.length === 0) return;
    if (sendingRef.current) return; // prevent double-submit
    sendingRef.current = true;

    // Immediately show user message + thinking placeholder
    const tempUserMsg = {
      _id: `temp-user-${Date.now()}`,
      role: "user",
      content: input,
      createdAt: new Date().toISOString(),
    };
    const thinkingMsg = {
      _id: `thinking-${Date.now()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      isThinking: true,
    };
    setMessages((prev) => [...prev, tempUserMsg, thinkingMsg]);

    // Clear input and files immediately
    const sentInput = input;
    const sentFiles = [...attachedFiles];
    setInput("");
    setAttachedFiles([]);
    setLoading(true);

    try {
      // If no chat exists yet, create one using the first message as the title
      let activeChatId = chatId;
      if (!activeChatId) {
        const chatTitle = sentInput.trim().length > 0
          ? sentInput.trim().slice(0, 80) + (sentInput.trim().length > 80 ? "…" : "")
          : "New Chat";
        const cid = companyData?._id;
        const createResp = await authorizedFetch(`${API_URL}/chats`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(cid ? { "x-company-id": cid } : {}),
            ...(userId ? { "x-user-id": userId } : {}),
          },
          body: JSON.stringify({ title: chatTitle, ...(cid ? { company_id: cid } : {}), ...(userId ? { user_id: userId } : {}) }),
        });
        if (!createResp.ok) {
          setMessages((prev) => prev.filter((m) => m._id !== thinkingMsg._id));
          setLoading(false);
          return;
        }
        const newChat = await createResp.json();
        activeChatId = newChat.chatId;
        setChatId(activeChatId);
      }

      let resp;
      if (sentFiles.length > 0) {
        const formData = new FormData();
        formData.append("content", sentInput);
        if (companyData?._id) formData.append("company_id", companyData._id);
        if (userId) formData.append("user_id", userId);
        sentFiles.forEach((file) => formData.append("files", file));

        resp = await authorizedFetch(`${API_URL}/chats/${activeChatId}/messages/upload`, {
          method: "POST",
          credentials: "include",
          headers: {
            ...(companyData?._id ? { "x-company-id": companyData._id } : {}),
            ...(userId ? { "x-user-id": userId } : {}),
          },
          body: formData,
        });
      } else {
        const cid = companyData?._id;
        resp = await authorizedFetch(`${API_URL}/chats/${activeChatId}/messages`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(cid ? { "x-company-id": cid } : {}),
            ...(userId ? { "x-user-id": userId } : {}),
          },
          body: JSON.stringify({ content: sentInput, ...(cid ? { company_id: cid } : {}), ...(userId ? { user_id: userId } : {}) }),
        });
      }

      if (resp.ok) {
        const { userMessage, assistantMessage } = await resp.json();
        // Replace temp messages with real ones
        setMessages((prev) =>
          prev
            .filter((m) => m._id !== tempUserMsg._id && m._id !== thinkingMsg._id)
            .concat([userMessage, assistantMessage])
        );
      } else {
        // Remove thinking bubble on error
        setMessages((prev) => prev.filter((m) => m._id !== thinkingMsg._id));
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setMessages((prev) => prev.filter((m) => m._id !== thinkingMsg._id));
    }
    setLoading(false);
    sendingRef.current = false;
  };

  // Workflows integration: "Run as Task"
  const submitAsTask = async (assistantMessage) => {
    if (!companyData?._id) {
      console.warn("[submitAsTask] No company data, cannot submit task");
      return;
    }

    const msgId = assistantMessage._id;
    setTaskStatuses((prev) => ({ ...prev, [msgId]: { status: "submitting" } }));

    // Find the user message that preceded this assistant response
    const msgIndex = messages.findIndex((m) => m._id === msgId);
    const userMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;
    const taskTitle = userMsg?.content?.slice(0, 120) || "Chat task";
    const taskDescription = userMsg?.content || assistantMessage.content?.slice(0, 500) || "";

    const ticketId = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const payload = {
      companyId: companyData._id,
      userId: userId || undefined,
      ticket: {
        ticketId,
        title: taskTitle,
        description: taskDescription,
        status: "open",
        approved: true,
      },
      company: {
        name: companyData.name || "",
        description: companyData.description || "",
        goals: companyData.goals || [],
        kpis: companyData.kpis || [],
        areasOfWork: companyData.areasOfWork || [],
        usage: companyData.usage || "",
        connectedServices: (companyData.connectedServices || []).map((s) => ({
          provider: s.provider,
          meta: s.meta,
          installationId: s.installationId,
        })),
      },
    };

    try {
      const resp = await authorizedFetch(`${API_URL}/tickets/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        const data = await resp.json();
        setTaskStatuses((prev) => ({
          ...prev,
          [msgId]: { status: "in_progress", runId: data.runId, ticketId },
        }));

        // Append a system-like message indicating the task was submitted
        setMessages((prev) => [
          ...prev,
          {
            _id: `task-${ticketId}`,
            role: "assistant",
            content: `Task submitted. Your request "${taskTitle}" is being processed by the workflows engine.\n\nTicket ID: ${ticketId}\nRun ID: ${data.runId}\n\nYou can track progress in Goals & Tickets.`,
            createdAt: new Date().toISOString(),
            isTaskNotification: true,
          },
        ]);
      } else {
        const errData = await resp.json().catch(() => ({}));
        console.error("[submitAsTask] Failed:", errData);
        setTaskStatuses((prev) => ({
          ...prev,
          [msgId]: { status: "failed" },
        }));
      }
    } catch (err) {
      console.error("[submitAsTask] Error:", err);
      setTaskStatuses((prev) => ({
        ...prev,
        [msgId]: { status: "failed" },
      }));
    }
  };

  // Decide on an action the agent stopped short of running.
  const resolveApproval = async (message, decision, note) => {
    const approvalId = message?.approval?.approvalId;
    if (!approvalId || decidingApproval) return;
    setDecidingApproval(approvalId);

    const thinkingMsg = {
      _id: `thinking-${Date.now()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      isThinking: true,
    };
    setMessages((prev) => [...prev, thinkingMsg]);

    try {
      const cid = companyData?._id;
      const resp = await authorizedFetch(
        `${API_URL}/chats/${chatId}/approvals/${approvalId}`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(cid ? { "x-company-id": cid } : {}),
            ...(userId ? { "x-user-id": userId } : {}),
          },
          body: JSON.stringify({
            decision,
            note: note || "",
            ...(cid ? { company_id: cid } : {}),
            ...(userId ? { user_id: userId } : {}),
          }),
        }
      );

      if (!resp.ok) {
        // 409 means someone already decided this; reloading shows the truth rather than leaving a stale card the user can click again.
        console.error("[resolveApproval] Failed:", await resp.text().catch(() => ""));
        setMessages((prev) => prev.filter((m) => m._id !== thinkingMsg._id));
        if (resp.status === 409 && chatId) await loadMessages(chatId);
        return;
      }

      const { updatedMessage, assistantMessage } = await resp.json();
      setMessages((prev) => {
        const next = prev
          .filter((m) => m._id !== thinkingMsg._id)
          .map((m) => (updatedMessage && m._id === updatedMessage._id ? updatedMessage : m));
        return assistantMessage ? [...next, assistantMessage] : next;
      });
    } catch (err) {
      console.error("[resolveApproval] Error:", err);
      setMessages((prev) => prev.filter((m) => m._id !== thinkingMsg._id));
    } finally {
      setDecidingApproval(null);
    }
  };

  const {
    correctingId, setCorrectingId, correctionText, setCorrectionText,
    feedbackGiven, feedbackError, correctionSaving, sendFeedback, submitCorrection, closeCorrection,
  } = useChatFeedback({ chatId, companyId: companyData?._id, userId });

  // Edit (fork-on-edit)
  const editMessage = async (messageId) => {
    const newContent = prompt("Edit your message:");
    if (!newContent) return;
    const resp = await authorizedFetch(`${API_URL}/chats/${chatId}/messages/${messageId}/edit`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(companyData?._id ? { "x-company-id": companyData._id } : {}),
        ...(userId ? { "x-user-id": userId } : {}),
      },
      body: JSON.stringify({ newContent, ...(companyData?._id ? { company_id: companyData._id } : {}), ...(userId ? { user_id: userId } : {}) }),
    });
    if (resp.ok) {
      const { newChat, messages: newMsgs } = await resp.json();
      setChatId(newChat.chatId);
      setMessages(newMsgs);
    }
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Copy to clipboard
  const [copiedId, setCopiedId] = useState(null);
  // Copied replies carry their AI marking (data-ai-* html plus a plain-text disclosure).
  const copyToClipboard = (text, msgId, provenance) => {
    copyWithCredential(text, provenance)
      .then(() => {
        setCopiedId(msgId);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch((err) => console.error("[Chat] copy failed", err));
  };

  const exportMessage = (m) => {
    const stamp = new Date(m.createdAt || Date.now()).toISOString().slice(0, 10);
    downloadWithCredential(`aisty-response-${stamp}.md`, m.content, m.provenance);
  };

  return (
    <div className="chat-layout">
      <div className="chat-layout__main">
        <div className="chat-messages">
          {messages.length === 0 && !searchParams.get("id") && (
            <ChatEmpty setInput={setInput} />
          )}
          <MessageList
            copiedId={copiedId}
            copyToClipboard={copyToClipboard}
            decidingApproval={decidingApproval}
            editMessage={editMessage}
            exportMessage={exportMessage}
            feedbackError={feedbackError}
            feedbackGiven={feedbackGiven}
            messages={messages}
            submitAsTask={submitAsTask}
            taskStatuses={taskStatuses}
            resolveApproval={resolveApproval}
            sendFeedback={sendFeedback}
            setCorrectingId={setCorrectingId}
            setCorrectionText={setCorrectionText}
          />
          <div ref={messagesEndRef} />
        </div>

        <ChatComposer
          attachedFiles={attachedFiles}
          input={input}
          loading={loading}
          sendMessage={sendMessage}
          setAttachedFiles={setAttachedFiles}
          setInput={setInput}
        />
      </div>

      {correctingId && createPortal(
        <CorrectionModal
          closeCorrection={closeCorrection}
          correctingId={correctingId}
          correctionSaving={correctionSaving}
          correctionText={correctionText}
          feedbackError={feedbackError}
          setCorrectionText={setCorrectionText}
          submitCorrection={submitCorrection}
        />,
        document.body
      )}
    </div>
  );
}