import { CloseIcon } from "../../utils/Icons";
import { FIELD_LIMITS } from "./constants";

// Create-goal modal.
export default function GoalModal({ gt }) {
  const {
    newGoalTitle, setNewGoalTitle, newGoalDesc, setNewGoalDesc, newGoalTarget, setNewGoalTarget, closeGoalModal, createGoal,
  } = gt;

  return (
    <div className="goalsTickets__modalOverlay" onClick={closeGoalModal}>
      <div
        className="goalsTickets__modal goalsTickets__modal--center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="goalsTickets__modalHeader">
          <h2>Create New Goal</h2>
          <button className="goalsTickets__modalClose" onClick={closeGoalModal}>
            <CloseIcon width={14} height={14} />
          </button>
        </div>
        <div className="goalsTickets__modalBody">
          <div className="goalsTickets__formGroup">
            <label htmlFor="goalTitle">Goal *</label>
            <input
              id="goalTitle"
              type="text"
              value={newGoalTitle}
              onChange={(e) => setNewGoalTitle(e.target.value)}
              maxLength={FIELD_LIMITS.goalTitle}
              placeholder="What are you trying to achieve?"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newGoalTitle.trim()) createGoal();
              }}
            />
          </div>

          <div className="goalsTickets__formGroup">
            <label htmlFor="goalDescription">Description</label>
            <textarea
              id="goalDescription"
              value={newGoalDesc}
              onChange={(e) => setNewGoalDesc(e.target.value)}
              maxLength={FIELD_LIMITS.goalDescription}
              placeholder="Any context that helps shape the tickets under this goal."
              rows={3}
            />
          </div>

          <div className="goalsTickets__formGroup">
            <label htmlFor="goalTarget">Target</label>
            <input
              id="goalTarget"
              type="text"
              value={newGoalTarget}
              onChange={(e) => setNewGoalTarget(e.target.value)}
              maxLength={FIELD_LIMITS.goalTarget}
              placeholder="How you will know it is done, e.g. 20 qualified leads"
            />
          </div>
        </div>
        <div className="goalsTickets__modalFooter">
          <button className="goalsTickets__modalCancelBtn" onClick={closeGoalModal}>
            Cancel
          </button>
          <button
            className="goalsTickets__modalCreateBtn"
            disabled={!newGoalTitle.trim()}
            onClick={createGoal}
          >
            Create Goal
          </button>
        </div>
      </div>
    </div>
  );
}
