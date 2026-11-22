import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Chat from "./Chat";
import ChatHistoryPage from "./ChatHistoryPage";

export default function ChatPage() {
  return (
    <Routes>
      <Route path="/" element={<Chat />} />
      <Route path="/history" element={<ChatHistoryPage />} />
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}