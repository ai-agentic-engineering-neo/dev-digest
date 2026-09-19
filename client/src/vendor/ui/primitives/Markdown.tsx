import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Heading scale. Tailwind Preflight (imported by styles.css) resets every
 * heading to `font-size: inherit; font-weight: inherit`, so a rendered `#`
 * would otherwise be indistinguishable from body copy — these restore it. */
const HEADING: Record<1 | 2 | 3, React.CSSProperties> = {
  1: { fontSize: "1.5em", fontWeight: 700, margin: "0 0 12px", color: "var(--text-primary)" },
  2: { fontSize: "1.25em", fontWeight: 700, margin: "18px 0 10px", color: "var(--text-primary)" },
  3: { fontSize: "1.05em", fontWeight: 650, margin: "16px 0 8px", color: "var(--text-primary)" },
};

/** Preflight also strips list markers and indentation — restore both. */
const LIST: React.CSSProperties = { margin: "0 0 10px", paddingLeft: 22 };

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          h1: ({ children }) => <h1 style={HEADING[1]}>{children}</h1>,
          h2: ({ children }) => <h2 style={HEADING[2]}>{children}</h2>,
          h3: ({ children }) => <h3 style={HEADING[3]}>{children}</h3>,
          ul: ({ children }) => <ul style={{ ...LIST, listStyle: "disc" }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ ...LIST, listStyle: "decimal" }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: "0 0 4px" }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "0 0 10px",
                padding: "2px 0 2px 12px",
                borderLeft: "2px solid var(--border-strong)",
                color: "var(--text-secondary)",
              }}
            >
              {children}
            </blockquote>
          ),
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
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
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
