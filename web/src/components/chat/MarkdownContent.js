import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CheckIcon, CopyIcon } from "../utils/Icons";

const MARKDOWN_COMPONENTS = { code: CodeBlock };

function CodeBlock({ inline, className, children, ...props }) {
  const match = /language-(\w+)/.exec(className || "");
  const codeString = String(children).replace(/\n$/, "");
  const [copied, setCopied] = useState(false);

  if (!inline && (match || codeString.includes("\n"))) {
    return (
      <div className="chat-code-block">
        <div className="chat-code-header">
          <span className="chat-code-lang">{match ? match[1] : "code"}</span>
          <button
            className="chat-code-copy"
            onClick={() => {
              navigator.clipboard.writeText(codeString);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
          </button>
        </div>
        <SyntaxHighlighter
          style={oneLight}
          language={match ? match[1] : "text"}
          PreTag="div"
          customStyle={{ margin: 0, borderRadius: "0 0 8px 8px", fontSize: "0.85rem" }}
          {...props}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    );
  }
  return <code className="chat-inline-code" {...props}>{children}</code>;
}

// Assistant reply: an optional collapsed <think> block, then GitHub-flavoured markdown.
export default function MarkdownContent({ content }) {
  if (typeof content !== "string") return <div>{content}</div>;
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  const thinkContent = thinkMatch ? thinkMatch[1].trim() : null;
  const mainContent = thinkMatch
    ? content.replace(/<think>[\s\S]*?<\/think>/, "").trim()
    : content;

  return (
    <>
      {thinkContent && (
        <details className="chat-think-block">
          <summary>Thinking…</summary>
          <div className="chat-think-content">{thinkContent}</div>
        </details>
      )}
      {mainContent && (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={MARKDOWN_COMPONENTS}
        >
          {mainContent}
        </ReactMarkdown>
      )}
    </>
  );
}
