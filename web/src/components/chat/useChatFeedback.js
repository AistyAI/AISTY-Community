import { useEffect, useState } from "react";
import { authorizedFetch } from "../utils/verifiedCall";
import { API_URL } from "./constants";

// Thumbs up/down votes and the written correction that goes with a thumbs-down.
export default function useChatFeedback({ chatId, companyId, userId }) {
  const [correctingId, setCorrectingId] = useState(null);
  const [correctionText, setCorrectionText] = useState("");
  const [feedbackGiven, setFeedbackGiven] = useState({});
  const [feedbackError, setFeedbackError] = useState(null);   // messageId of the last failed vote
  const [correctionSaving, setCorrectionSaving] = useState(false);

  // Votes reset on chat switch so the map can't grow unbounded.
  useEffect(() => {
    setFeedbackGiven({});
    setFeedbackError(null);
  }, [chatId]);

  // Returns true when the vote was actually persisted.
  const sendFeedback = async (messageId, vote, comment = "") => {
    setFeedbackError(null);
    try {
      const resp = await authorizedFetch(`${API_URL}/chats/${chatId}/messages/${messageId}/feedback`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(companyId ? { "x-company-id": companyId } : {}),
          ...(userId ? { "x-user-id": userId } : {}),
        },
        body: JSON.stringify({
          vote,
          ...(comment ? { comment } : {}),
          ...(companyId ? { company_id: companyId } : {}),
          ...(userId ? { user_id: userId } : {}),
        }),
      });
      if (!resp.ok) throw new Error(`feedback failed: ${resp.status}`);
      setFeedbackGiven((prev) => ({ ...prev, [messageId]: vote }));
      return true;
    } catch (err) {
      console.error("[sendFeedback] Error:", err);
      setFeedbackError(messageId);
      return false;
    }
  };

  const submitCorrection = async (messageId) => {
    const text = correctionText.trim();
    if (!text || correctionSaving) return;
    setCorrectionSaving(true);
    const ok = await sendFeedback(messageId, "down", text);
    setCorrectionSaving(false);
    if (!ok) return;   // keep the modal open so the correction is not lost
    setCorrectingId(null);
    setCorrectionText("");
  };

  const closeCorrection = () => {
    if (correctionSaving) return;
    setCorrectingId(null);
    setCorrectionText("");
  };

  return {
    correctingId,
    setCorrectingId,
    correctionText,
    setCorrectionText,
    feedbackGiven,
    feedbackError,
    correctionSaving,
    sendFeedback,
    submitCorrection,
    closeCorrection,
  };
}
