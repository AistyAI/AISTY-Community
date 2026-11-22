import { useState, useEffect } from "react";
import { useToast } from "../../../ui";
import { fetchWithHankoAuth } from "../../utils/verifiedCall";
import { CheckIcon, PaperclipIcon, CopyIcon, DownloadIcon } from "../../utils/Icons";
import { copyWithCredential, downloadWithCredential } from "../../utils/aiProvenance";
import { API_URL, PROJECT, stripThinkTags } from "./constants";

// Render a single AI response entry: the cleaned text, the actions that carry its marking off-platform, and its content credential.
export function AiResponseBlock({ response, ticketTitle }) {
  const text = stripThinkTags(response.text || "");
  const [copied, setCopied] = useState(false);
  const { addToast } = useToast();

  const handleCopy = async () => {
    try {
      // Copies both a text/plain and a text/html flavour, so the marking survives a paste into a rich-text editor as well as a plain one.
      await copyWithCredential(text, response.provenance);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[AiResponseBlock] copy failed", err);
      addToast("Could not copy the response.", "error");
    }
  };

  const handleExport = () => {
    const slug = (ticketTitle || "ai-response")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "ai-response";
    downloadWithCredential(`${slug}.md`, text, response.provenance);
    addToast("Exported with an AI disclosure.", "success");
  };

  return (
    <div className="goalsTickets__aiResponse">
      <p className="goalsTickets__aiResponseText">{text}</p>
      <div className="goalsTickets__aiResponseActions">
        <button type="button" onClick={handleCopy} title="Copy with AI marking attached">
          {copied ? <CheckIcon width={13} height={13} /> : <CopyIcon width={13} height={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={handleExport} title="Download with an AI disclosure">
          <DownloadIcon width={13} height={13} /> Export
        </button>
      </div>
    </div>
  );
}

// Render an attachment as a download / view link.
export function AttachmentLink({ attachment, index }) {
  const name = attachment.filename || attachment.name || `File ${index + 1}`;
  const rawUrl = attachment.url;
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState("");

  const isS3 = rawUrl && rawUrl.startsWith("s3://");

  // For s3:// links, resolve the presigned URL on first render
  useEffect(() => {
    if (!isS3 || downloadUrl) return;
    let cancelled = false;
    setFetching(true);
    fetchWithHankoAuth(
      `${API_URL}/storage/ticket-file/download?project=${PROJECT}&url=${encodeURIComponent(rawUrl)}`
    )
      .then((data) => {
        if (!cancelled) setDownloadUrl(data.url);
      })
      .catch((err) => {
        console.error("[AttachmentLink] presign failed", err);
        if (!cancelled) setFetchErr("Download unavailable");
      })
      .finally(() => { if (!cancelled) setFetching(false); });
    return () => { cancelled = true; };
  }, [isS3, rawUrl, downloadUrl]);

  if (!rawUrl) return null;

  if (isS3) {
    if (fetchErr) return <span className="goalsTickets__attachmentLink goalsTickets__attachmentLink--error"><PaperclipIcon width={14} height={14} /> {name} ({fetchErr})</span>;
    if (fetching || !downloadUrl) return <span className="goalsTickets__attachmentLink goalsTickets__attachmentLink--loading"><PaperclipIcon width={14} height={14} /> {name}…</span>;
    return (
      <a
        href={downloadUrl}
        download={name}
        className="goalsTickets__attachmentLink"
      >
        <PaperclipIcon width={14} height={14} /> {name}
      </a>
    );
  }

  return (
    <a
      href={rawUrl}
      target="_blank"
      rel="noreferrer"
      className="goalsTickets__attachmentLink"
    >
      <PaperclipIcon width={14} height={14} /> {name}
    </a>
  );
}
