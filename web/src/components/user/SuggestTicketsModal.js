import React, { useState, useMemo } from "react";
import { StarsIcon } from "../utils/Icons";

// SuggestTicketsModal: AI-powered ticket suggestion popup.
function SuggestTicketsModal({ suggestions, existingGoals, onApprove, onClose, loading }) {
  const suggestedGoals = useMemo(() => suggestions?.goals || [], [suggestions]);

  // Track selected state: { [goalIndex]: { selected: bool, tickets: { [ticketIndex]: bool } } }
  const [selection, setSelection] = useState(() => {
    const initial = {};
    suggestedGoals.forEach((goal, gi) => {
      const ticketMap = {};
      (goal.tickets || []).forEach((_, ti) => {
        ticketMap[ti] = true; // All selected by default
      });
      initial[gi] = { selected: true, tickets: ticketMap };
    });
    return initial;
  });

  // Recompute selection when suggestions change (e.g. loaded after initial render)
  React.useEffect(() => {
    if (!suggestedGoals.length) return;
    setSelection((prev) => {
      // Only reset if we don't already have the right structure
      const needsReset = Object.keys(prev).length !== suggestedGoals.length;
      if (!needsReset) return prev;
      const initial = {};
      suggestedGoals.forEach((goal, gi) => {
        const ticketMap = {};
        (goal.tickets || []).forEach((_, ti) => {
          ticketMap[ti] = true;
        });
        initial[gi] = { selected: true, tickets: ticketMap };
      });
      return initial;
    });
  }, [suggestedGoals]);

  const toggleGoal = (goalIndex) => {
    setSelection((prev) => {
      const goalState = prev[goalIndex] || { selected: true, tickets: {} };
      const newSelected = !goalState.selected;
      const updatedTickets = {};
      Object.keys(goalState.tickets).forEach((ti) => {
        updatedTickets[ti] = newSelected;
      });
      return { ...prev, [goalIndex]: { selected: newSelected, tickets: updatedTickets } };
    });
  };

  const toggleTicket = (goalIndex, ticketIndex) => {
    setSelection((prev) => {
      const goalState = prev[goalIndex] || { selected: true, tickets: {} };
      const updatedTickets = { ...goalState.tickets, [ticketIndex]: !goalState.tickets[ticketIndex] };
      const anySelected = Object.values(updatedTickets).some(Boolean);
      return { ...prev, [goalIndex]: { selected: anySelected, tickets: updatedTickets } };
    });
  };

  const selectAll = () => {
    const allSelected = {};
    suggestedGoals.forEach((goal, gi) => {
      const ticketMap = {};
      (goal.tickets || []).forEach((_, ti) => {
        ticketMap[ti] = true;
      });
      allSelected[gi] = { selected: true, tickets: ticketMap };
    });
    setSelection(allSelected);
  };

  const deselectAll = () => {
    const noneSelected = {};
    suggestedGoals.forEach((goal, gi) => {
      const ticketMap = {};
      (goal.tickets || []).forEach((_, ti) => {
        ticketMap[ti] = false;
      });
      noneSelected[gi] = { selected: false, tickets: ticketMap };
    });
    setSelection(noneSelected);
  };

  const { totalTickets, selectedTickets } = useMemo(() => {
    let total = 0;
    let selected = 0;
    suggestedGoals.forEach((goal, gi) => {
      (goal.tickets || []).forEach((_, ti) => {
        total++;
        if (selection[gi]?.tickets[ti]) selected++;
      });
    });
    return { totalTickets: total, selectedTickets: selected };
  }, [suggestedGoals, selection]);

  const allSelected = selectedTickets === totalTickets && totalTickets > 0;

  const handleApprove = () => {
    const approved = [];
    suggestedGoals.forEach((goal, gi) => {
      const goalState = selection[gi];
      if (!goalState) return;

      const selectedTicketList = [];
      (goal.tickets || []).forEach((ticket, ti) => {
        if (goalState.tickets[ti]) {
          selectedTicketList.push(ticket);
        }
      });

      if (selectedTicketList.length > 0) {
        approved.push({
          ...goal,
          tickets: selectedTicketList,
        });
      }
    });

    if (approved.length > 0) {
      onApprove(approved);
    }
  };

  return (
    <div className="goalsTickets__modalOverlay" onClick={onClose}>
      <div
        className="goalsTickets__modal goalsTickets__modal--center suggestModal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="goalsTickets__modalHeader">
          <h2>
            <StarsIcon />
            AI Ticket Suggestions
            </h2>
          <button className="goalsTickets__modalClose" onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className="goalsTickets__modalBody suggestModal__body">
          {loading ? (
            <div className="suggestModal__loading">
              <div className="suggestModal__spinner" />
              <p>Analysing your goals, completed work, and integrations…</p>
              <p className="suggestModal__loadingHint">This may take a minute</p>
            </div>
          ) : suggestedGoals.length === 0 ? (
            <div className="suggestModal__empty">
              <p>No suggestions were generated. Try adding more goals or completing some tickets first.</p>
            </div>
          ) : (
            <>
              {/* Select all / deselect controls */}
              <div className="suggestModal__controls">
                <span className="suggestModal__count">
                  {selectedTickets} of {totalTickets} ticket{totalTickets !== 1 ? "s" : ""} selected
                </span>
                <button
                  className="suggestModal__controlBtn"
                  onClick={allSelected ? deselectAll : selectAll}
                >
                  {allSelected ? "Deselect All" : "Select All"}
                </button>
              </div>

              {/* Goals with nested tickets */}
              <div className="suggestModal__goalsList">
                {suggestedGoals.map((goal, gi) => {
                  const goalState = selection[gi] || { selected: false, tickets: {} };
                  const matchingExisting = !goal.isNew && goal.goalId
                    ? existingGoals.find((eg) => eg.goalId === goal.goalId)
                    : null;

                  return (
                    <div key={gi} className="suggestModal__goalGroup">
                      {/* Goal header */}
                      <div
                        className={`suggestModal__goalHeader ${goalState.selected ? "suggestModal__goalHeader--selected" : ""}`}
                        onClick={() => toggleGoal(gi)}
                      >
                        <div className="suggestModal__goalCheck">
                          <input
                            type="checkbox"
                            checked={goalState.selected}
                            onChange={() => toggleGoal(gi)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="suggestModal__goalInfo">
                          <div className="suggestModal__goalTitle">
                            {goal.isNew && <span className="suggestModal__newBadge">NEW GOAL</span>}
                            {goal.title}
                          </div>
                          {goal.description && (
                            <div className="suggestModal__goalDesc">{goal.description}</div>
                          )}
                          {matchingExisting && (
                            <div className="suggestModal__existingBadge">
                              Existing goal
                            </div>
                          )}
                        </div>
                        <span className="suggestModal__ticketCount">
                          {(goal.tickets || []).length} ticket{(goal.tickets || []).length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Tickets under this goal */}
                      <div className="suggestModal__ticketsList">
                        {(goal.tickets || []).map((ticket, ti) => {
                          const isSelected = goalState.tickets[ti] || false;
                          return (
                            <div
                              key={ti}
                              className={`suggestModal__ticketItem ${isSelected ? "suggestModal__ticketItem--selected" : ""}`}
                              onClick={() => toggleTicket(gi, ti)}
                            >
                              <div className="suggestModal__ticketCheck">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleTicket(gi, ti)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="suggestModal__ticketInfo">
                                <div className="suggestModal__ticketTitle">{ticket.title}</div>
                                {ticket.description && (
                                  <div className="suggestModal__ticketDesc">{ticket.description}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && suggestedGoals.length > 0 && (
          <div className="goalsTickets__modalFooter">
            <button className="goalsTickets__modalCancelBtn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="goalsTickets__modalCreateBtn"
              onClick={handleApprove}
              disabled={selectedTickets === 0}
            >
              Add {selectedTickets} Ticket{selectedTickets !== 1 ? "s" : ""} to Roadmap
            </button>
          </div>
        )}

        {!loading && suggestedGoals.length === 0 && (
          <div className="goalsTickets__modalFooter">
            <button className="goalsTickets__modalCancelBtn" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SuggestTicketsModal;
