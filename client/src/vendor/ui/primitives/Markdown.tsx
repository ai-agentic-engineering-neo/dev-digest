import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/* Module-level so each renderer keeps its identity across renders: inline
   component functions are a new element type every render and remount the text. */
const COMPONENTS: Components = {
  p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
  strong: ({ children }) => (
    <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
  ),
  // Fenced blocks: `pre` wraps a `code` child; flag it so the code renderer
  // leaves the inline chip styling off.
  pre: ({ children }) => (
    <pre
      className="mono"
      style={{
        margin: "0 0 10px",
        padding: "10px 12px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        color: "var(--text-primary)",
        fontSize: "0.9em",
        lineHeight: 1.5,
        overflowX: "auto",
        whiteSpace: "pre",
      }}
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ "data-block"?: boolean }>, { "data-block": true })
          : child,
      )}
    </pre>
  ),
  code: ({ children, ...props }) =>
    (props as { "data-block"?: boolean })["data-block"] ? (
      <code className="mono">{children}</code>
    ) : (
      <code
        className="mono"
        style={{
          fontSize: "0.92em",
          padding: "1px 6px",
          borderRadius: 4,
          background: "var(--bg-hover)",
          color: "var(--accent-text)",
        }}
      >
        {children}
      </code>
    ),
  a: ({ children, href }) => (
    <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
      {children}
    </a>
  ),
};

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
