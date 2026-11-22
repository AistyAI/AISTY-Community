export { API_URL, AI_WORKFLOWS_URL } from "../../../config";
export const PROJECT = "Aisty";

export const EMPTY_GOAL = { title: "", description: "", target: "", goalId: undefined };
export const createTicketId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const EMPTY_TICKET = { ticketId: createTicketId(), title: "", description: "", status: "open", goalId: null, priority: "medium", dueDate: null };

export const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical", color: "#ef4444" },
  { value: "high", label: "High", color: "#f59e0b" },
  { value: "medium", label: "Medium", color: "#3b82f6" },
  { value: "low", label: "Low", color: "#10b981" },
];

// Mirrors CoreBackend's services/validation.js LIMITS so the inputs stop where the API would refuse the save.
export const FIELD_LIMITS = {
  ticketTitle: 200,
  ticketDescription: 10000,
  ticketComment: 5000,
  goalTitle: 200,
  goalDescription: 2000,
  goalTarget: 200,
  search: 200,
};

export const BOARD_COLUMNS = [
  { value: "open", label: "Open", color: "#64748b" },
  { value: "approved", label: "Approved", color: "#f59e0b" },
  // The task was approved but the plan the AI produced for it needs a look before anything runs.
  { value: "awaiting_approval", label: "Awaiting Approval", color: "#a16207" },
  { value: "in_progress", label: "In Progress", color: "#3b82f6" },
  { value: "completed", label: "Completed", color: "#10b981" },
  { value: "failed", label: "Failed", color: "#ef4444" },
  { value: "cancelled", label: "Cancelled", color: "#9ca3af" },
];

// The execution state the workflow engine reports back on a ticket.
export const EXECUTION_LABELS = {
  queued: "Queued",
  planning: "Planning",
  awaiting_approval: "Awaiting approval",
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  expired: "Expired",
};

/** Human label for any snake_case status the backend can send. */
export const formatStatusValue = (value) => {
  if (!value) return "";
  if (EXECUTION_LABELS[value]) return EXECUTION_LABELS[value];
  const words = String(value).replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Strip <think>...</think> blocks (including multiline) from AI responses */
export const stripThinkTags = (text = "") =>
  text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
