import { Button, BinIcon, BackIcon } from "../../../ui";

// Onboarding step: the goals the workspace is working towards.
export default function GoalsStep({ addGoal, goals, nextStep, prevStep, removeGoal, updateGoal }) {
  return (
    <div className="onboarding-step">
      <div className="onboarding-title">
        <div>
          <h2>Goals</h2>
          <p>Tell us the important goals you want us to help you reach.</p>
        </div>
        <Button variant="secondary" onClick={addGoal}>
          + Add goal
        </Button>
      </div>

      {goals.length === 0 && (
        <div className="onboarding-empty">No goals added yet. Click &ldquo;+ Add goal&rdquo; to define your first objective.</div>
      )}

      <div className="goals">
        {goals.map((g, idx) => (
          <div className="goal-card" key={idx}>
            <label>
              Title
              <input
                placeholder="e.g. Increase customer retention"
                value={g.title}
                onChange={(e) => updateGoal(idx, "title", e.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                placeholder="What does achieving this goal look like?"
                value={g.description}
                onChange={(e) => updateGoal(idx, "description", e.target.value)}
              />
            </label>
            <label>
              Target
              <input
                placeholder="e.g. 90% retention by Q4"
                value={g.target}
                onChange={(e) => updateGoal(idx, "target", e.target.value)}
              />
            </label>
            <Button variant="secondary" onClick={() => removeGoal(idx)}>
              <BinIcon /> Remove
            </Button>
          </div>
        ))}
      </div>

      <div className="actions">
        <Button variant="secondary" onClick={prevStep}>
          <BackIcon /> Back
        </Button>
        <Button onClick={() => nextStep("tickets")}>Continue</Button>
      </div>
    </div>
  );
}
