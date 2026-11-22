import { Button, BinIcon, BackIcon } from "../../../ui";

// Onboarding step: first tickets under each goal.
export default function TicketsStep({ addTicket, handleFinishOnboarding, loading, prevStep, removeTicket, tickets, updateTicket }) {
  return (
    <div className="onboarding-step">
      <div className="onboarding-title">
        <div>
          <h2>Tickets</h2>
          <p>Define the initial actionable tickets for us to complete.</p>
        </div>
        <Button variant="secondary" onClick={addTicket}>
          + Add ticket
        </Button>
      </div>

      {tickets.length === 0 && (
        <div className="onboarding-empty">No tickets added yet. Click &ldquo;+ Add ticket&rdquo; to create your first task.</div>
      )}

      <div className="goals">
        {tickets.map((t, idx) => (
          <div className="ticket-card" key={idx}>
            <label>
              Title
              <input
                placeholder="e.g. Audit social media channels"
                value={t.title}
                onChange={(e) => updateTicket(idx, "title", e.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                placeholder="What should be done and what's the expected outcome?"
                value={t.description}
                onChange={(e) => updateTicket(idx, "description", e.target.value)}
              />
            </label>
            <Button variant="secondary" onClick={() => removeTicket(idx)}>
              <BinIcon /> Remove
            </Button>
          </div>
        ))}
      </div>

      <div className="actions">
        <Button variant="secondary" onClick={prevStep}>
          <BackIcon /> Back
        </Button>
        <Button onClick={handleFinishOnboarding} disabled={loading}>
          {loading ? "Creating workspace…" : "Create workspace"}
        </Button>
      </div>
    </div>
  );
}
