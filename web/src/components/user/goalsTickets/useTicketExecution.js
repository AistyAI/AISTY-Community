import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchWithHankoAuth, authorizedFetch } from "../../utils/verifiedCall";
import { API_URL, AI_WORKFLOWS_URL, PROJECT } from "./constants";

// Ticket execution, plan approvals, comments and the detail panel.
export default function useTicketExecution({ addToast, companyData, fetchCompany, loading, tickets, setTickets }) {
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [ticketComments, setTicketComments] = useState({});
  const [newComment, setNewComment] = useState("");

  // A held ticket only carries the approval id and risk; the plan is fetched separately.
  const [planCards, setPlanCards] = useState({});      // approvalId → card
  const [decidingPlan, setDecidingPlan] = useState(null);

  useEffect(() => {
    const ticket = tickets.find((t) => t.ticketId === selectedTicketId);
    const approvalId = ticket?.pendingApproval?.approvalId;
    if (!approvalId || planCards[approvalId]) return;

    let cancelled = false;
    (async () => {
      try {
        const resp = await authorizedFetch(
          `${AI_WORKFLOWS_URL}/tickets/${ticket.ticketId}/approvals/${approvalId}`,
          { headers: companyData?._id ? { "x-company-id": companyData._id } : {} }
        );
        if (!resp.ok || cancelled) return;
        const { approval } = await resp.json();
        setPlanCards((prev) => ({ ...prev, [approvalId]: approval }));
      } catch (err) {
        console.error("[planApproval] Could not load the plan:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedTicketId, tickets, planCards, companyData]);

  const decidePlan = async (ticket, decision, note) => {
    const approvalId = ticket?.pendingApproval?.approvalId;
    if (!approvalId || decidingPlan) return;
    setDecidingPlan(approvalId);

    try {
      const resp = await authorizedFetch(
        `${AI_WORKFLOWS_URL}/tickets/${ticket.ticketId}/approvals/${approvalId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(companyData?._id ? { "x-company-id": companyData._id } : {}),
          },
          body: JSON.stringify({
            decision,
            note: note || "",
            ...(companyData?._id ? { company_id: companyData._id } : {}),
            ...(companyData?.ownerId ? { user_id: companyData.ownerId } : {}),
          }),
        }
      );

      if (!resp.ok) {
        if (resp.status === 409) {
          addToast("That plan was already decided. Refreshing.", "info");
          await fetchCompany();
        } else {
          addToast("Could not record your decision. Please try again.", "error");
        }
        return;
      }

      const data = await resp.json();
      if (data.status === "approved") {
        setTickets((prev) =>
          prev.map((t) =>
            t.ticketId === ticket.ticketId
              ? {
                  ...t,
                  status: "in_progress",
                  pendingApproval: null,
                  execution: { ...(t.execution || {}), status: "in_progress", runId: data.runId },
                }
              : t
          )
        );
        addToast("Plan approved. The AI is now working on it.", "success");
      } else if (data.status === "declined") {
        setTickets((prev) =>
          prev.map((t) =>
            t.ticketId === ticket.ticketId
              ? { ...t, status: "cancelled", pendingApproval: null,
                  execution: { ...(t.execution || {}), status: "cancelled" } }
              : t
          )
        );
        addToast("Plan declined. Nothing was executed.", "info");
      } else if (data.status === "revised") {
        // The revised plan arrives as a new approval once the AI has re-planned.
        setTickets((prev) =>
          prev.map((t) =>
            t.ticketId === ticket.ticketId
              ? { ...t, status: "in_progress", pendingApproval: null,
                  execution: { ...(t.execution || {}), status: "in_progress" } }
              : t
          )
        );
        addToast("The AI is re-planning with your changes.", "info");
        watchForHeldPlan(ticket.ticketId);
      } else {
        addToast("The AI could not re-plan that task.", "error");
        await fetchCompany();
      }
    } catch (err) {
      console.error("[planApproval] Error:", err);
      addToast("Could not record your decision. Please try again.", "error");
    } finally {
      setDecidingPlan(null);
    }
  };

  const handleApprove = async (ticketId) => {
    try {
      await fetchWithHankoAuth(`${API_URL}/tickets/${ticketId}/approve?project=${PROJECT}`, {
        method: "POST",
      });

      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.ticketId === ticketId
            ? {
                ...ticket,
                approved: true,
                status: "in_progress",
                execution: { ...(ticket.execution || {}), status: "in_progress" },
              }
            : ticket
        )
      );

      // Also submit to local AI workflows for execution
      const ticket = tickets.find((t) => t.ticketId === ticketId);
      if (ticket) {
        submitTicketForExecution(ticket);
      }

      addToast("Ticket approved. The AI is now working on it.", "success");
    } catch (err) {
      console.error("Failed to approve ticket:", err);
      addToast("Failed to approve ticket. Please try again.", "error");
    }
  };

  // Submit a ticket directly to the local AI workflows service for execution.
  const submitTicketForExecution = async (ticket) => {
    if (!companyData?._id) {
      console.warn("[submitTicketForExecution] No companyData available, skipping");
      return;
    }

    try {
      const payload = {
        companyId: companyData._id,
        userId: companyData.ownerId || "",
        ticket: {
          ticketId: ticket.ticketId,
          title: ticket.title,
          description: ticket.description,
          status: ticket.status,
          priority: ticket.priority || "medium",
          dueDate: ticket.dueDate || null,
          goalId: ticket.goalId,
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

      const response = await authorizedFetch(`${AI_WORKFLOWS_URL}/tickets/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error("[submitTicketForExecution] Failed:", errData);
        return;
      }

      const data = await response.json();
      console.log("[submitTicketForExecution] Ticket submitted:", data);

      // Update ticket to in_progress in the UI
      setTickets((prev) =>
        prev.map((t) =>
          t.ticketId === ticket.ticketId
            ? {
                ...t,
                status: "in_progress",
                approved: true,
                execution: { ...(t.execution || {}), status: "in_progress", runId: data.runId },
              }
            : t
        )
      );

      // Planning happens after the submit returns, so at this point we don't yet know whether the plan will need approval.
      watchForHeldPlan(ticket.ticketId);
    } catch (err) {
      console.error("[submitTicketForExecution] Error:", err);
    }
  };

  // Refetch a few times while the planner runs, stopping as soon as the ticket reaches a settled state.
  const watchForHeldPlan = useCallback((ticketId) => {
    const delays = [5000, 10000, 15000, 30000];
    let stopped = false;

    const check = async (index) => {
      if (stopped || index >= delays.length) return;
      try {
        const fresh = await fetchCompany();
        const t = (fresh?.tickets || []).find((x) => x.ticketId === ticketId);
        if (t?.pendingApproval?.approvalId) {
          stopped = true;
          addToast("The AI has a plan for that task and needs your approval.", "info");
          return;
        }
        // Anything terminal means there is nothing left to wait for.
        if (["completed", "failed", "cancelled"].includes(t?.status)) {
          stopped = true;
          return;
        }
      } catch (_) { /* a missed refresh is not worth surfacing */ }
      setTimeout(() => check(index + 1), delays[index]);
    };

    setTimeout(() => check(0), delays[0]);
  }, [fetchCompany, addToast]);

  const fetchComments = async (ticketId) => {
    try {
      const response = await fetchWithHankoAuth(
        `${API_URL}/tickets/${ticketId}/comments?project=${PROJECT}`
      );
      const comments = response?.comments || [];
      setTicketComments((prev) => ({ ...prev, [ticketId]: comments }));
    } catch (err) {
      console.error("Failed to fetch comments:", err);
      addToast("Failed to load comments.", "error");
    }
  };

  const addComment = async (ticketId) => {
    if (!newComment.trim()) return;

    try {
      const response = await fetchWithHankoAuth(
        `${API_URL}/tickets/${ticketId}/comments?project=${PROJECT}`,
        {
          method: "POST",
          body: JSON.stringify({ text: newComment }),
        }
      );

      const comment = response?.comment;
      if (comment) {
        setTicketComments((prev) => ({
          ...prev,
          [ticketId]: [...(prev[ticketId] || []), comment],
        }));
        setNewComment("");
        addToast("Comment added successfully.", "success");
      }
    } catch (err) {
      console.error("Failed to add comment:", err);
      addToast("Failed to add comment.", "error");
    }
  };

  const openTicketDetails = async (ticketId) => {
    setSelectedTicketId(ticketId);
    if (!ticketComments[ticketId]) {
      await fetchComments(ticketId);
    }
  };

  const closeTicketDetails = () => {
    setSelectedTicketId(null);
    setNewComment("");
    // Drop the deep-link param so closing the drawer does not leave a URL that reopens it on the next navigation back to this page.
    if (searchParams.get("ticket")) {
      setSearchParams({}, { replace: true });
    }
  };

  // Deep link: /goals-tickets?ticket=<id> opens that ticket's panel once the list has loaded.
  useEffect(() => {
    const wanted = searchParams.get("ticket");
    if (!wanted || loading || selectedTicketId) return;
    if (tickets.some((t) => t.ticketId === wanted)) {
      openTicketDetails(wanted);
    }
    // openTicketDetails is stable enough here: it only reads state setters and
    // the comment cache, and re-running on every render would reopen the panel
    // the user just closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tickets, loading, selectedTicketId]);

  return {
    selectedTicketId,
    ticketComments,
    newComment,
    setNewComment,
    planCards,
    decidingPlan,
    decidePlan,
    handleApprove,
    submitTicketForExecution,
    addComment,
    openTicketDetails,
    closeTicketDetails,
  };
}
