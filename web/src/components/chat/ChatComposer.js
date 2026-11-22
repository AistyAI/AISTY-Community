import { PaperclipIcon, CloseIcon } from "../utils/Icons";
import { Button } from "../../ui";

// Message box with attached files and the send button.
export default function ChatComposer({
  attachedFiles,
  input,
  loading,
  sendMessage,
  setAttachedFiles,
  setInput,
}) {
  return (
    <div className="chat-input-wrapper">
      <div className="chat-input-card">
        {attachedFiles.length > 0 && (
          <div className="chat-attached-files">
            {attachedFiles.map((file, idx) => (
              <div key={idx} className="chat-attached-file">
                <span className="chat-attached-file__icon"><PaperclipIcon /></span>
                <span className="chat-attached-file__name">{file.name}</span>
                <button
                  className="chat-attached-file__remove"
                  onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                  title="Remove file"
                >
                  <CloseIcon />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Send a message..."
        />
        <div className="chat-input-actions">
          <Button onClick={sendMessage} disabled={loading}>
            {loading ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
      <p className="chat-disclaimer">Aisty AI can make mistakes. Consider checking important information.</p>
    </div>
  );
}
