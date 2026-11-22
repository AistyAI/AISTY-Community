import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useToast } from "../../../ui";
import { fetchWithHankoAuth, authorizedFetch } from "../../utils/verifiedCall";
import { API_URL, AI_WORKFLOWS_URL, PROJECT, EMPTY_GOAL, createTicketId, FIELD_LIMITS } from "./constants";

// Goals and tickets state, CRUD, filtering and the debounced save.
export default function useGoalsData() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [goals, setGoals] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [viewMode, setViewMode] = useState("kanban"); // kanban, list or recurring
  const [hasFetched, setHasFetched] = useState(false);
  const [showAddTaskForm, setShowAddTaskForm] = useState(false);
  const [newTaskGoalId, setNewTaskGoalId] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskRecurrence, setNewTaskRecurrence] = useState("none"); // none|daily|weekly|monthly|quarterly|yearly
  // Goal creation mirrors the task modal.
  const [showAddGoalForm, setShowAddGoalForm] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDesc, setNewGoalDesc] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [collapsedGoals, setCollapsedGoals] = useState({}); // goalId -> bool, controls list-view group fold state
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [companyData, setCompanyData] = useState(null);

  const fetchCompany = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetchWithHankoAuth(
        `${API_URL}/company/me?project=${PROJECT}`
      );
      const company = response?.company ?? response;

      const normalizedGoals = (company?.goals || []).map((goal, idx) => ({
        goalId: goal.goalId || createTicketId(),
        title: (goal.title || "").trim(),
        description: (goal.description || "").trim(),
        target: (goal.target || "").trim(),
      }));

      const normalizedTickets = (company?.tickets || []).map((ticket) => ({
        ticketId: ticket.ticketId || createTicketId(),
        title: (ticket.title || "").trim(),
        description: (ticket.description || "").trim(),
        status: ticket.status || "open",
        priority: ticket.priority || "medium",
        dueDate: ticket.dueDate || null,
        goalId: ticket.goalId || null,
        approved: ticket.approved || false,
        approvedAt: ticket.approvedAt || null,
        recurringTemplateId: ticket.recurringTemplateId || null,
        // A plan the AI is holding for approval.
        pendingApproval: ticket.pendingApproval || null,
        // AI-origin attribution.
        aiGenerated: Boolean(ticket.aiGenerated),
        aiOrigin: ticket.aiOrigin || (ticket.aiGenerated ? "ai-agent" : ""),
        execution: ticket.execution || {},
        responses: ticket.responses || [],
        attachments: ticket.attachments || [],
        knowledgeGap: Boolean(ticket.knowledgeGap),
      }));

      setGoals(normalizedGoals);
      setTickets(normalizedTickets);
      setCompanyData(company);

      setInitialSnapshot({
        goals: normalizedGoals,
        tickets: normalizedTickets,
      });
      setHasFetched(true);
      setError("");
      // Returned so callers that need to inspect what just arrived (rather than wait a render for state) can do so.
      return { goals: normalizedGoals, tickets: normalizedTickets, company };
    } catch (err) {
      console.error("Failed to load goals/tickets:", err);
      setError("Unable to load goals. Please refresh the page.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch on mount only
  useEffect(() => {
    if (!hasFetched) {
      fetchCompany();
    }
  }, [hasFetched, fetchCompany]);

  const saveTimerRef = useRef(null);
  const pendingTicketsRef = useRef(null);

  const handleGoalChange = (goalId, field, value) => {
    setGoals((prev) => {
      return prev.map((goal) =>
        (goal.goalId === goalId || prev.indexOf(goal) === goalId)
          ? { ...goal, [field]: value }
          : goal
      );
    });
    
    // Debounce save for text inputs
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveChanges();
    }, 1000);
  };

  const handleTicketChange = (ticketId, field, value) => {
    setTickets((prev) => {
      const updated = prev.map((ticket) =>
        ticket.ticketId === ticketId
          ? { ...ticket, [field]: value }
          : ticket
      );
      pendingTicketsRef.current = updated;
      return updated;
    });

    // Save after state update: immediate for status changes, debounced for text
    if (field === "status") {
      // Use a microtask to ensure state has settled
      Promise.resolve().then(() => {
        saveChanges(pendingTicketsRef.current);
      });
    } else {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveChanges(pendingTicketsRef.current);
      }, 1000);
    }
  };

  /** Open the goal modal. Nothing is created until createGoal() runs. */
  const addGoal = () => {
    setNewGoalTitle("");
    setNewGoalDesc("");
    setNewGoalTarget("");
    setShowAddGoalForm(true);
  };

  const closeGoalModal = () => {
    setShowAddGoalForm(false);
    setNewGoalTitle("");
    setNewGoalDesc("");
    setNewGoalTarget("");
  };

  const createGoal = () => {
    if (!newGoalTitle.trim()) return;
    const goalId = createTicketId();
    const goal = {
      ...EMPTY_GOAL,
      goalId,
      title: newGoalTitle.trim(),
      description: newGoalDesc.trim(),
      target: newGoalTarget.trim(),
    };
    setGoals((prev) => {
      const updated = [...prev, goal];
      // Save with explicit data after state settles, matching the old inline path.
      setTimeout(() => saveChanges(null, updated, "goal.create"), 0);
      return updated;
    });
    closeGoalModal();
  };
  const removeGoal = (goalId) => {
    setGoals((prev) => {
      const updated = prev.filter((goal) => goal.goalId !== goalId);
      setTimeout(() => saveChanges(null, updated, "goal.delete"), 0);
      return updated;
    });
  };

  const removeTicket = (ticketId) => {
    // Cancel any in-progress execution on the AI workflows side
    authorizedFetch(`${AI_WORKFLOWS_URL}/tickets/${ticketId}/cancel`, { method: "POST" }).catch(() => {});
    setTickets((prev) => {
      const updated = prev.filter((ticket) => ticket.ticketId !== ticketId);
      pendingTicketsRef.current = updated;
      return updated;
    });
    // Save after state update
    Promise.resolve().then(() => {
      saveChanges(pendingTicketsRef.current);
    });
  };

  const cancelTicketExecution = (ticketId) => {
    authorizedFetch(`${AI_WORKFLOWS_URL}/tickets/${ticketId}/cancel`, { method: "POST" })
      .then(() => {
        setTickets((prev) =>
          prev.map((t) =>
            t.ticketId === ticketId
              ? { ...t, status: "cancelled", execution: { ...t.execution, status: "cancelled" } }
              : t
          )
        );
      })
      .catch((err) => console.error("Failed to cancel ticket:", err));
  };

  // Stop the recurring schedule that spawned this ticket.
  const stopRecurring = useCallback(
    async (templateId) => {
      if (!templateId) return;
      const ok = window.confirm(
        "Stop this recurring task from creating any more tickets in the future? Existing tickets are unaffected."
      );
      if (!ok) return;
      try {
        await fetchWithHankoAuth(
          `${API_URL}/recurring-tickets/${templateId}/disable?project=${PROJECT}`,
          { method: "POST" }
        );
        addToast("Recurrence stopped. No more tickets will be created.", "success");
      } catch (err) {
        console.error("[GoalsAndTickets] Failed to disable recurrence:", err);
        addToast(`Failed to stop recurrence: ${err.message || err}`, "error");
      }
    },
    [addToast]
  );

  // Suggest Tickets (AI) The API requires a non-blank title and enforces the FIELD_LIMITS lengths.
  const sanitizeGoals = useCallback((list) =>
    (list || [])
      .map((goal) => ({
        goalId: goal.goalId || createTicketId(),
        title: (goal.title || "").trim().slice(0, FIELD_LIMITS.goalTitle),
        description: (goal.description || "").trim().slice(0, FIELD_LIMITS.goalDescription),
        target: (goal.target || "").trim().slice(0, FIELD_LIMITS.goalTarget),
      }))
      .filter((goal) => goal.title || goal.description || goal.target)
      .map((goal) => (goal.title ? goal : { ...goal, title: "Untitled goal" })),
  []);

  const sanitizeTickets = useCallback((list) =>
    (list || [])
      .map((ticket) => ({
        ticketId: ticket.ticketId || createTicketId(),
        title: (ticket.title || "").trim().slice(0, FIELD_LIMITS.ticketTitle),
        description: (ticket.description || "").trim().slice(0, FIELD_LIMITS.ticketDescription),
        status: ticket.status || "open",
        priority: ticket.priority || "medium",
        dueDate: ticket.dueDate || null,
        goalId: ticket.goalId || null,
        // Preserve link to the parent recurring template (server-side field)
        ...(ticket.recurringTemplateId ? { recurringTemplateId: ticket.recurringTemplateId } : {}),
        // Re-sent so an unrelated edit (retitling a task, moving a column) doesn't clear a plan that is still waiting on someone.
        ...(ticket.pendingApproval ? { pendingApproval: ticket.pendingApproval } : {}),
        // Art.
        ...(ticket.aiGenerated ? { aiGenerated: true, aiOrigin: ticket.aiOrigin || "ai-agent" } : {}),
      }))
      .filter((ticket) => ticket.title || ticket.description)
      .map((ticket) => (ticket.title ? ticket : { ...ticket, title: "Untitled task" })),
  []);

  const getTicketsForGoal = useCallback((goalId) => {
    return tickets.filter((ticket) => ticket.goalId === goalId);
  }, [tickets]);

  const getShortId = (ticketId) => {
    if (!ticketId) return "TSK";
    const short = String(ticketId).replace(/-/g, "").slice(0, 6);
    return `TSK-${short}`;
  };

  const filteredTickets = useMemo(() => {
    if (!searchQuery.trim()) return tickets;
    const q = searchQuery.toLowerCase();
    return tickets.filter((ticket) => {
      const goal = goals.find((g) => g.goalId === ticket.goalId);
      return (
        (ticket.title || "").toLowerCase().includes(q) ||
        (ticket.description || "").toLowerCase().includes(q) ||
        (goal?.title || "").toLowerCase().includes(q) ||
        getShortId(ticket.ticketId).toLowerCase().includes(q)
      );
    });
  }, [tickets, goals, searchQuery]);

  const getTicketsForColumn = useCallback((status) => {
    return filteredTickets.filter((ticket) => ticket.status === status);
  }, [filteredTickets]);

  // Use refs so saveChanges always reads current state without depending on it
  const goalsRef = useRef(goals);
  const ticketsRef = useRef(tickets);
  const initialSnapshotRef = useRef(initialSnapshot);
  goalsRef.current = goals;
  ticketsRef.current = tickets;
  initialSnapshotRef.current = initialSnapshot;

  // Save function to be called after user actions
  const saveChanges = useCallback(async (ticketsOverride = null, goalsOverride = null, auditHint = null) => {
    if (!initialSnapshotRef.current) return;

    const cleanedGoals = sanitizeGoals(goalsOverride || goalsRef.current);
    const cleanedTickets = sanitizeTickets(ticketsOverride || ticketsRef.current);

    if (!cleanedGoals.length && !cleanedTickets.length) return;

    try {
      setSaving(true);
      console.log("[GoalsAndTickets] Saving payload:", {
        goals: cleanedGoals.length,
        tickets: cleanedTickets.length,
        ticketSample: cleanedTickets[0]
          ? {
              ticketId: cleanedTickets[0].ticketId,
              title: cleanedTickets[0].title,
              goalId: cleanedTickets[0].goalId,
              status: cleanedTickets[0].status,
            }
          : null,
      });
      await fetchWithHankoAuth(`${API_URL}/company/me?project=${PROJECT}`, {
        method: "PUT",
        body: JSON.stringify({ goals: cleanedGoals, tickets: cleanedTickets }),
        headers: auditHint ? { "X-Audit-Hint": auditHint } : undefined,
      });

      const sourceTickets = ticketsOverride || ticketsRef.current;
      const mergedTickets = sourceTickets.map((ticket) => ({
        ...ticket,
        ticketId: ticket.ticketId || createTicketId(),
      }));
      setInitialSnapshot({ goals: cleanedGoals, tickets: mergedTickets });
    } catch (err) {
      console.error("Failed to save goals/tickets:", err);
    } finally {
      setSaving(false);
    }
  }, [sanitizeGoals, sanitizeTickets]);

  return {
    addToast,
    loading,
    saving,
    error,
    goals,
    setGoals,
    tickets,
    setTickets,
    viewMode,
    setViewMode,
    showAddTaskForm,
    setShowAddTaskForm,
    newTaskGoalId,
    setNewTaskGoalId,
    newTaskTitle,
    setNewTaskTitle,
    newTaskDesc,
    setNewTaskDesc,
    newTaskPriority,
    setNewTaskPriority,
    newTaskDueDate,
    setNewTaskDueDate,
    newTaskRecurrence,
    setNewTaskRecurrence,
    showAddGoalForm,
    newGoalTitle,
    setNewGoalTitle,
    newGoalDesc,
    setNewGoalDesc,
    newGoalTarget,
    setNewGoalTarget,
    collapsedGoals,
    setCollapsedGoals,
    showCreateMenu,
    setShowCreateMenu,
    searchQuery,
    setSearchQuery,
    companyData,
    fetchCompany,
    handleGoalChange,
    handleTicketChange,
    addGoal,
    closeGoalModal,
    createGoal,
    removeGoal,
    removeTicket,
    cancelTicketExecution,
    stopRecurring,
    getTicketsForGoal,
    getShortId,
    getTicketsForColumn,
    saveChanges,
  };
}
