import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from '../../ui';
import { fetchWithHankoAuth, getSessionUserId, authorizedFetch } from "../utils/verifiedCall";
import { PlusIcon, TrashIcon } from "../utils/Icons";
import "../../styles/chat/chatHistory.css";
import { API_URL } from "../../config";

const PROJECT = "Aisty";

/** Human-friendly relative time, e.g. "2 hours ago", "3 days ago" */
function relativeTime(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function ChatHistoryPage() {
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState(null);
  const [companyData, setCompanyData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Resolve user (from the session token) and load company
  useEffect(() => {
    getSessionUserId().then((id) => { if (id) setUserId(id); });
  }, []);

  useEffect(() => {
    if (!userId) return;
    const loadCompany = async () => {
      try {
        const response = await fetchWithHankoAuth(`${API_URL}/company/me?project=${PROJECT}`);
        const company = response?.company ?? response;
        setCompanyData(company);
      } catch (err) {
        console.error("Failed to load company data:", err);
      }
    };
    loadCompany();
  }, [userId]);

  // Load chats (keyed by company_id)
  useEffect(() => {
    if (!companyData?._id) return;
    const load = async () => {
      setLoading(true);
      try {
        const resp = await authorizedFetch(`${API_URL}/chats`, {
          credentials: "include",
          headers: {
            "x-company-id": companyData._id,
            ...(userId ? { "x-user-id": userId } : {}),
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          setChats(data);
        }
      } catch (err) {
        console.error("Failed to load chats:", err);
      }
      setLoading(false);
    };
    load();
  }, [companyData, userId]);

  // Filtered chats
  const filtered = useMemo(() => {
    if (!search.trim()) return chats;
    const q = search.toLowerCase();
    return chats.filter((c) =>
      (c.title || "").toLowerCase().includes(q)
    );
  }, [chats, search]);

  // Sorted by most recent first
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) =>
      new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );
  }, [filtered]);

  // Delete a chat
  const deleteChat = async (e, chatId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this chat?")) return;
    try {
      await authorizedFetch(`${API_URL}/chats/${chatId}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          ...(companyData?._id ? { "x-company-id": companyData._id } : {}),
          ...(userId ? { "x-user-id": userId } : {}),
        },
      });
      setChats((prev) => prev.filter((c) => c.chatId !== chatId));
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  };

  // Create new chat and navigate to it
  const handleNewChat = async () => {
    const cid = companyData?._id;
    try {
      const resp = await authorizedFetch(`${API_URL}/chats`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(cid ? { "x-company-id": cid } : {}),
          ...(userId ? { "x-user-id": userId } : {}),
        },
        body: JSON.stringify({ title: "New Chat", ...(cid ? { company_id: cid } : {}), ...(userId ? { user_id: userId } : {}) }),
      });
      if (resp.ok) {
        const chat = await resp.json();
        navigate(`/chat?id=${chat.chatId}`);
      }
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
  };

  return (
    <div className="chatHistoryPage">
      {/* Header */}
      <div className="chatHistoryPage__header">
        <div className="chatHistoryPage__titleRow">
          <h1 className="chatHistoryPage__title">Chats</h1>
          <Button size="sm" onClick={handleNewChat}>
            <PlusIcon />
            New chat
          </Button>
        </div>

        {/* Search */}
        <div className="chatHistoryPage__search">
          <input
            type="text"
            placeholder="Search your chats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Count */}
        <div className="chatHistoryPage__count">
          <span>{filtered.length} chat{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Chat list */}
      <div className="chatHistoryPage__list">
        {loading ? (
          <div className="chatHistoryPage__empty">Loading chats…</div>
        ) : sorted.length === 0 ? (
          <div className="chatHistoryPage__empty">
            {search ? "No chats match your search." : "No chats yet. Start a new conversation!"}
          </div>
        ) : (
          sorted.map((chat) => (
            <div
              key={chat.chatId}
              className="chatHistoryPage__item"
              onClick={() => navigate(`/chat?id=${chat.chatId}`)}
            >
              <div className="chatHistoryPage__itemContent">
                <p className="chatHistoryPage__itemTitle">
                  {chat.title || "Untitled Chat"}
                </p>
                <p className="chatHistoryPage__itemMeta">
                  Last message {relativeTime(chat.updatedAt || chat.createdAt)}
                </p>
              </div>
              <button
                className="chatHistoryPage__itemDelete"
                onClick={(e) => deleteChat(e, chat.chatId)}
                title="Delete chat"
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
