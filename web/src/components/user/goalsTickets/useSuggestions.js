import { useState } from "react";
import { authorizedFetch } from "../../utils/verifiedCall";
import { AI_WORKFLOWS_URL, createTicketId } from "./constants";

// AI-suggested goals and tickets.
export default function useSuggestions({ addToast, companyData, goals, tickets, setGoals, setTickets, saveChanges }) {
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState({ goals: [] });

  const handleSuggestTickets = async () => {
    setShowSuggestModal(true);
    setSuggestLoading(true);
    setSuggestions({ goals: [] });

    try {
      const submitResp = await authorizedFetch(`${AI_WORKFLOWS_URL}/tickets/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: companyData?._id || "",
          userId: companyData?.ownerId || "",
          goals: goals || [],
          tickets: tickets || [],
          company: {
            name: companyData?.name || "",
            description: companyData?.description || "",
            goals: companyData?.goals || [],
            kpis: companyData?.kpis || [],
            areasOfWork: companyData?.areasOfWork || [],
            connectedServices: (companyData?.connectedServices || []).map((s) => ({
              type: s.type,
              name: s.name,
            })),
          },
        }),
      });
      if (!submitResp.ok) throw new Error(`Suggest failed: ${submitResp.status} ${submitResp.statusText}`);
      const { jobId } = await submitResp.json();
      if (!jobId) throw new Error("No jobId returned from suggest endpoint");

      // 2. Poll for results: each poll is a fast request (<1s)
      const POLL_INTERVAL = 4000; // 4 seconds
      const MAX_POLL_TIME = 600000; // 10 minutes
      const startTime = Date.now();

      const pollForResult = () =>
        new Promise((resolve, reject) => {
          const interval = setInterval(async () => {
            try {
              if (Date.now() - startTime > MAX_POLL_TIME) {
                clearInterval(interval);
                reject(new Error("Suggestion timed out after 10 minutes"));
                return;
              }
              const pollResp = await authorizedFetch(`${AI_WORKFLOWS_URL}/jobs/${jobId}`);
              if (!pollResp.ok && pollResp.status !== 502) {
                clearInterval(interval);
                reject(new Error(`Poll failed: ${pollResp.status}`));
                return;
              }
              const result = await pollResp.json();
              if (result.status === "complete") {
                clearInterval(interval);
                resolve(result.data);
              } else if (result.status === "failed") {
                clearInterval(interval);
                reject(new Error(result.error || "AI suggestion failed"));
              }
              // else status "processing" → keep polling
            } catch (err) {
              clearInterval(interval);
              reject(err);
            }
          }, POLL_INTERVAL);
        });

      const data = await pollForResult();
      setSuggestions(data || { goals: [] });
    } catch (err) {
      console.error("Failed to get ticket suggestions:", err);
      addToast("Failed to generate suggestions. Please try again.", "error");
      setSuggestions({ goals: [] });
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleApproveSuggestions = (approvedGoals) => {
    let newGoals = [...goals];
    let newTickets = [...tickets];

    for (const suggestedGoal of approvedGoals) {
      let targetGoalId;

      if (suggestedGoal.isNew || !suggestedGoal.goalId) {
        // Create a new goal
        const newGoalId = createTicketId();
        newGoals.push({
          goalId: newGoalId,
          title: suggestedGoal.title,
          description: suggestedGoal.description,
          target: "",
        });
        targetGoalId = newGoalId;
      } else {
        // Use the existing goalId
        targetGoalId = suggestedGoal.goalId;
      }

      // Create tickets under this goal
      for (const suggestedTicket of suggestedGoal.tickets || []) {
        newTickets.push({
          ticketId: createTicketId(),
          title: suggestedTicket.title,
          description: suggestedTicket.description,
          status: "open",
          goalId: targetGoalId,
          aiGenerated: true,
          aiOrigin: "ai-suggestion",
        });
      }
    }

    setGoals(newGoals);
    setTickets(newTickets);
    saveChanges(newTickets, newGoals);

    const totalAdded = approvedGoals.reduce((sum, g) => sum + (g.tickets?.length || 0), 0);
    const newGoalCount = approvedGoals.filter((g) => g.isNew || !g.goalId).length;
    let msg = `Added ${totalAdded} ticket${totalAdded !== 1 ? "s" : ""} to your roadmap`;
    if (newGoalCount > 0) {
      msg += ` and ${newGoalCount} new goal${newGoalCount !== 1 ? "s" : ""}`;
    }
    addToast(msg, "success");

    setShowSuggestModal(false);
    setSuggestions({ goals: [] });
  };

  return {
    showSuggestModal,
    setShowSuggestModal,
    suggestLoading,
    suggestions,
    setSuggestions,
    handleSuggestTickets,
    handleApproveSuggestions,
  };
}
