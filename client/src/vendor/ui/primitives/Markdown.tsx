import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mermaid } from "./Mermaid";

/** Markdown renderer (replaces prototype mdLite). Block + inline + GFM.
 *  Tailwind's preflight strips heading/list defaults, so every structural
 *  element is styled explicitly here against the theme tokens. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ---- text ----
          p: ({ children }) => <p style={md.p}>{children}</p>,
          strong: ({ children }) => <strong style={md.strong}>{children}</strong>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" style={md.a}>
              {children}
            </a>
          ),

          // ---- headings (restore hierarchy that Tailwind preflight resets) ----
          h1: ({ children }) => <h1 style={md.h1}>{children}</h1>,
          h2: ({ children }) => <h2 style={md.h2}>{children}</h2>,
          h3: ({ children }) => <h3 style={md.h3}>{children}</h3>,
          h4: ({ children }) => <h4 style={md.h4}>{children}</h4>,
          h5: ({ children }) => <h5 style={md.h5}>{children}</h5>,
          h6: ({ children }) => <h6 style={md.h6}>{children}</h6>,

          // ---- lists ----
          ul: ({ children }) => <ul style={md.ul}>{children}</ul>,
          ol: ({ children }) => <ol style={md.ol}>{children}</ol>,
          li: ({ children }) => <li style={md.li}>{children}</li>,

          // ---- blockquote / rule ----
          blockquote: ({ children }) => <blockquote style={md.blockquote}>{children}</blockquote>,
          hr: () => <hr style={md.hr} />,

          // ---- code: mermaid diagram > block (pre>code) > inline ----
          pre: ({ children }) => {
            // A fenced block renders as <pre><code class="language-*">…</code>.
            // Route ```mermaid to the diagram renderer instead of a code box.
            const child = React.Children.toArray(children)[0] as
              | React.ReactElement<{ className?: string; children?: React.ReactNode }>
              | undefined;
            const cls = child?.props?.className ?? "";
            if (typeof cls === "string" && /\blanguage-mermaid\b/.test(cls)) {
              const source = String(child?.props?.children ?? "").replace(/\n$/, "");
              return <Mermaid chart={source} />;
            }
            return <pre style={md.pre}>{children}</pre>;
          },
          code: ({ className, children }) => {
            const isBlock =
              /language-/.test(className ?? "") || String(children).includes("\n");
            return (
              <code className="mono" style={isBlock ? md.codeBlock : md.codeInline}>
                {children}
              </code>
            );
          },

          // ---- GFM tables ----
          table: ({ children }) => (
            <div style={md.tableWrap}>
              <table style={md.table}>{children}</table>
            </div>
          ),
          th: ({ children }) => <th style={md.th}>{children}</th>,
          td: ({ children }) => <td style={md.td}>{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — all theme-token based, correct in both dark and light.
// ---------------------------------------------------------------------------

const md = {
  p: { margin: "0 0 10px" },
  strong: { fontWeight: 650, color: "var(--text-primary)" },
  a: { color: "var(--accent-text)", textDecoration: "underline" },

  h1: {
    fontSize: "1.6em",
    fontWeight: 700,
    lineHeight: 1.25,
    color: "var(--text-primary)",
    margin: "24px 0 12px",
    paddingBottom: 6,
    borderBottom: "1px solid var(--border)",
  },
  h2: {
    fontSize: "1.3em",
    fontWeight: 650,
    lineHeight: 1.3,
    color: "var(--text-primary)",
    margin: "22px 0 10px",
    paddingBottom: 5,
    borderBottom: "1px solid var(--border)",
  },
  h3: {
    fontSize: "1.15em",
    fontWeight: 650,
    color: "var(--text-primary)",
    margin: "20px 0 8px",
  },
  h4: {
    fontSize: "1em",
    fontWeight: 650,
    color: "var(--text-primary)",
    margin: "16px 0 6px",
  },
  h5: {
    fontSize: "0.9em",
    fontWeight: 650,
    color: "var(--text-secondary)",
    margin: "14px 0 6px",
  },
  h6: {
    fontSize: "0.85em",
    fontWeight: 650,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    margin: "14px 0 6px",
  },

  ul: { margin: "0 0 10px", paddingLeft: "1.4em", listStyleType: "disc" as const },
  ol: { margin: "0 0 10px", paddingLeft: "1.4em", listStyleType: "decimal" as const },
  li: { margin: "2px 0" },

  blockquote: {
    margin: "0 0 10px",
    padding: "2px 0 2px 12px",
    borderLeft: "3px solid var(--border-strong)",
    color: "var(--text-secondary)",
  },

  hr: {
    border: 0,
    borderTop: "1px solid var(--border)",
    margin: "16px 0",
  },

  pre: {
    margin: "0 0 12px",
    padding: "12px 14px",
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflowX: "auto" as const,
    fontSize: "0.85em",
    lineHeight: 1.5,
  },
  codeBlock: {
    display: "block",
    whiteSpace: "pre" as const,
    background: "transparent",
    padding: 0,
    color: "var(--text-primary)",
  },
  codeInline: {
    fontSize: "0.92em",
    padding: "1px 6px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--accent-text)",
    whiteSpace: "normal" as const,
  },

  tableWrap: { overflowX: "auto" as const, margin: "0 0 12px" },
  table: {
    borderCollapse: "collapse" as const,
    fontSize: "0.92em",
  },
  th: {
    border: "1px solid var(--border)",
    padding: "5px 10px",
    textAlign: "left" as const,
    fontWeight: 650,
    background: "var(--bg-hover)",
    color: "var(--text-primary)",
  },
  td: {
    border: "1px solid var(--border)",
    padding: "5px 10px",
    color: "var(--text-primary)",
  },
} satisfies Record<string, React.CSSProperties>;
