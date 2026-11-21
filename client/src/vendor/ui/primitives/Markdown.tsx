import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

/** Markdown renderer (replaces prototype mdLite). Full GFM — headings, lists,
 *  task lists, tables, code blocks, quotes; typography lives in `.dd-md`
 *  (styles.css). Raw HTML is never rendered as live markup (no rehype-raw):
 *  by default it shows as inert text (brief AC-40 relies on that); with
 *  `skipHtml` it is dropped instead — for author-written bodies whose HTML
 *  comments (GitHub PR-template hints) are noise. `breaks` renders a single
 *  newline as a line break, the way GitHub shows PR/issue bodies. External
 *  links open in a new tab. */
export function Markdown({
  children,
  skipHtml = false,
  breaks = false,
}: {
  children?: string | null;
  skipHtml?: boolean;
  breaks?: boolean;
}) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={breaks ? [remarkGfm, remarkBreaks] : [remarkGfm]}
        skipHtml={skipHtml}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          a: ({ children, href }) => {
            const external = !!href && /^https?:\/\//.test(href);
            return (
              <a href={href} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
