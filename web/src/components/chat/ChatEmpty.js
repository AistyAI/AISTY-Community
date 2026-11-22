// First-run prompt shown before a conversation has any messages.
export default function ChatEmpty({ setInput }) {
  return (
    <div className="chatEmpty">
      <h2>What do you want to know?</h2>
      <p>
        Ask about your goals and tickets, or look things up in the tools you've connected. When you want
        something done, use Run as task on the answer: it becomes a ticket and follows your approval rules.
      </p>
      <div className="chatEmpty__prompts">
        {[
          "Which GitHub issues opened this week look most urgent?",
          "Summarise the open Jira issues for the operations project.",
          "Suggest three tickets that would move our first goal forward.",
        ].map((q) => (
          <button type="button" key={q} onClick={() => setInput(q)}>{q}</button>
        ))}
      </div>
    </div>
  );
}
