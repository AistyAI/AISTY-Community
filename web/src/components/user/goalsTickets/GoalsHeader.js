import { SearchIcon } from "../../../ui";
import { StarsIcon, CheckIcon, ClipboardIcon, RepeatIcon, GridViewIcon, ListViewIcon } from "../../utils/Icons";
import { FIELD_LIMITS } from "./constants";

// Page header and toolbar: counts, search, view switch, create menu.
export default function GoalsHeader({ gt }) {
  const {
    saving, goals, tickets, viewMode, setViewMode, setShowAddTaskForm, setNewTaskGoalId, showCreateMenu, setShowCreateMenu, searchQuery, setSearchQuery, addGoal, suggestLoading, handleSuggestTickets,
  } = gt;

  return (
    <>
      <header className="goalsTickets__header">
        <div className="goalsTickets__headerLeft">
          <h2>Goals & Tickets</h2>
          <span className="goalsTickets__headerTaskCount">{tickets.length}</span>
          {saving && <span className="goalsTickets__savingIndicator">Saving...</span>}
        </div>
        <div className="goalsTickets__actions">
          <div className="goalsTickets__viewToggle">
            <button
              className={`goalsTickets__viewBtn ${viewMode === "kanban" ? "goalsTickets__viewBtn--active" : ""}`}
              onClick={() => setViewMode("kanban")}
              title="Kanban view"
            >
              <GridViewIcon width={18} height={18} />
            </button>
            <button
              className={`goalsTickets__viewBtn ${viewMode === "list" ? "goalsTickets__viewBtn--active" : ""}`}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <ListViewIcon width={18} height={18} />
            </button>
            <button
              className={`goalsTickets__viewBtn ${viewMode === "recurring" ? "goalsTickets__viewBtn--active" : ""}`}
              onClick={() => setViewMode("recurring")}
              title="Recurring tasks"
            >
              <RepeatIcon width={18} height={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="goalsTickets__toolbar">
        <div className="goalsTickets__toolbarLeft">
          <div className="goalsTickets__searchBox">
            <span className="goalsTickets__searchIcon">
              <SearchIcon />
            </span>
            <input
              type="text"
              className="goalsTickets__searchInput"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              maxLength={FIELD_LIMITS.search}
            />
          </div>
        </div>
        <div className="goalsTickets__toolbarRight">
          <button
            className="goalsTickets__suggestBtn"
            onClick={handleSuggestTickets}
            disabled={suggestLoading}
          >
            <StarsIcon />
            Suggest Tickets
          </button>
          <div className="goalsTickets__createMenuContainer">
            <button
              className="goalsTickets__createBtn"
              onClick={() => setShowCreateMenu(!showCreateMenu)}
            >
              + Create
            </button>
            {showCreateMenu && (
              <div className="goalsTickets__createMenu">
                <button
                  className="goalsTickets__createMenuOption"
                  onClick={() => {
                    addGoal();
                    setShowCreateMenu(false);
                  }}
                >
                  <ClipboardIcon width={16} height={16} /> New Goal
                </button>
                <button
                  className="goalsTickets__createMenuOption"
                  onClick={() => {
                    setShowAddTaskForm(true);
                    setNewTaskGoalId(goals.length > 0 ? goals[0].goalId : null);
                    setShowCreateMenu(false);
                  }}
                >
                  <CheckIcon width={16} height={16} /> New Ticket
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
