import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Only render a link if it's http(s) or a relative/anchor URL — rejects
 * `javascript:`, `data:`, and other schemes an LLM-generated finding or a raw
 * GitHub PR comment body (both untrusted) could smuggle in.
 */
function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  // Relative / same-page URLs (no scheme) are always safe to pass through.
  if (/^(\.{0,2}\/|#)/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed, "http://dummy-base.invalid");
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => (
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
            <a
              href={safeHref(href)}
              style={{ color: "var(--accent-text)", textDecoration: "underline" }}
            >
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
