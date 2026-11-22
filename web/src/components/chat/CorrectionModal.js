import { ThumbsDownIcon, CloseIcon } from "../utils/Icons";
import { CORRECTION_MAX_LENGTH } from "./constants";

// Captures what a thumbs-down reply should have said.
export default function CorrectionModal({
  closeCorrection,
  correctingId,
  correctionSaving,
  correctionText,
  feedbackError,
  setCorrectionText,
  submitCorrection,
}) {
  return (
    <div
      className="chat-correction-overlay"
      role="presentation"
      onClick={closeCorrection}
    >
      <div
        className="chat-correction-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-correction-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") closeCorrection(); }}
      >
        <div className="chat-correction-modal__header">
          <span className="chat-correction-modal__icon" aria-hidden="true">
            <ThumbsDownIcon />
          </span>
          <div className="chat-correction-modal__heading">
            <h3 className="chat-correction-modal__title" id="chat-correction-title">
              Help improve this response
            </h3>
            <p className="chat-correction-modal__hint">
              Tell us what the answer should have been. Corrections are stored with the
              conversation for your team to review.
            </p>
          </div>
          <button
            type="button"
            className="chat-correction-modal__close"
            onClick={closeCorrection}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="chat-correction-modal__body">
          <label className="chat-correction-label" htmlFor="chat-correction-input">
            The correct answer
          </label>
          <textarea
            id="chat-correction-input"
            className="chat-correction-input"
            placeholder="Type the correct answer, or describe what should have happened instead…"
            value={correctionText}
            onChange={(e) => setCorrectionText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeCorrection();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitCorrection(correctingId);
            }}
            rows={6}
            maxLength={CORRECTION_MAX_LENGTH}
            autoFocus
          />
          <div className="chat-correction-meta">
            <span className="chat-correction-hintKeys">
              <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to submit
            </span>
            <span
              className={`chat-correction-count${
                correctionText.length > CORRECTION_MAX_LENGTH - 200 ? " is-near-limit" : ""
              }`}
            >
              {correctionText.length} / {CORRECTION_MAX_LENGTH}
            </span>
          </div>
          {feedbackError === correctingId && (
            <p className="chat-correction-error" role="alert">
              Couldn't save your correction. Check your connection and try again.
            </p>
          )}
        </div>

        <div className="chat-correction-actions">
          <button
            type="button"
            className="chat-correction-btn chat-correction-btn--ghost"
            onClick={closeCorrection}
            disabled={correctionSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="chat-correction-btn chat-correction-btn--primary"
            disabled={!correctionText.trim() || correctionSaving}
            onClick={() => submitCorrection(correctingId)}
          >
            {correctionSaving ? "Submitting…" : "Submit correction"}
          </button>
        </div>
      </div>
    </div>
  );
}
