import React from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

const SAFE_PROTOCOLS = /^(https?:|mailto:)/i;

/**
 * Only absolute http(s)/mailto links, or relative/anchor ones, survive.
 * `defaultUrlTransform` already drops `javascript:`; this also drops `data:`,
 * `vbscript:`, `file:` and anything else unexpected.
 */
export function safeUrlTransform(url: string): string {
  const cleaned = defaultUrlTransform(url);
  if (!cleaned) return "";
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(cleaned);
  return !hasScheme || SAFE_PROTOCOLS.test(cleaned) ? cleaned : "";
}

/**
 * Markdown renderer (replaces prototype mdLite). Inline + GFM.
 *
 * Renders UNTRUSTED text — LLM rationale (which can be steered by prompt
 * injection in a PR diff), PR comments, repository docs. S4
 * (plans/18-security-fixes.md): an `<img>` would make the browser fetch an
 * attacker-chosen URL the moment the text is shown, and a URL can carry
 * whatever context the model was tricked into writing into it. Images are
 * therefore rendered as inert text with their URL visible, never loaded.
 */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrlTransform}
        components={{
          img: ({ alt, src }) => (
            <span className="mono" data-testid="md-image-placeholder" style={{ color: "var(--text-secondary)" }}>
              [image{alt ? `: ${alt}` : ""}]{typeof src === "string" && src ? ` (${src})` : ""}
            </span>
          ),
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
              href={href || undefined}
              target="_blank"
              rel="noopener noreferrer nofollow"
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
