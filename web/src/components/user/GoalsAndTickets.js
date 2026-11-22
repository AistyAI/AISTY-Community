import SuggestTicketsModal from "./SuggestTicketsModal";
import RecurringTasks from "./RecurringTasks";
import useGoalsData from "./goalsTickets/useGoalsData";
import useSuggestions from "./goalsTickets/useSuggestions";
import useTicketExecution from "./goalsTickets/useTicketExecution";
import GoalsHeader from "./goalsTickets/GoalsHeader";
import KanbanBoard from "./goalsTickets/KanbanBoard";
import ListBoard from "./goalsTickets/ListBoard";
import GoalModal from "./goalsTickets/GoalModal";
import TaskModal from "./goalsTickets/TaskModal";
import TicketDetails from "./goalsTickets/TicketDetails";
import "../../styles/user/goalsTickets/base.css";
import "../../styles/user/goalsTickets/kanban.css";
import "../../styles/user/goalsTickets/goals.css";
import "../../styles/user/goalsTickets/details.css";
import "../../styles/user/goalsTickets/comments.css";
import "../../styles/user/goalsTickets/suggest.css";
import "../../styles/user/goalsTickets/list.css";
import "../../styles/user/goalsTickets/recurring.css";

export default function GoalsAndTickets() {
  const data = useGoalsData();
  const suggest = useSuggestions(data);
  const exec = useTicketExecution(data);
  const gt = { ...data, ...suggest, ...exec };

  if (gt.loading) {
    return <p className="goalsTickets__loading">Loading goals and tickets...</p>;
  }

  return (
    <div className="goalsTickets">
      <GoalsHeader gt={gt} />
      {gt.error && <p className="goalsTickets__error">{gt.error}</p>}

      {gt.viewMode === "recurring" ? (
        <RecurringTasks goals={gt.goals} />
      ) : gt.viewMode === "kanban" ? (
        <KanbanBoard gt={gt} />
      ) : (
        <ListBoard gt={gt} />
      )}

      {gt.showAddGoalForm && <GoalModal gt={gt} />}
      {gt.showAddTaskForm && <TaskModal gt={gt} />}
      {gt.selectedTicketId && <TicketDetails gt={gt} />}

      {gt.showSuggestModal && (
        <SuggestTicketsModal
          suggestions={gt.suggestions}
          existingGoals={gt.goals}
          onApprove={gt.handleApproveSuggestions}
          onClose={() => {
            gt.setShowSuggestModal(false);
            gt.setSuggestions({ goals: [] });
          }}
          loading={gt.suggestLoading}
        />
      )}
    </div>
  );
}
