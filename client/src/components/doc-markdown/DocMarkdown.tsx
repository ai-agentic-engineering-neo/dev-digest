/* DocMarkdown — readable markdown for project-context docs (SPEC-03 AC-3 typography, reused by
   SPEC-04 previews): three distinct heading levels, visible list markers, mono code on the code
   background, links opening in a new tab. Doc text is untrusted: raw HTML is shown as literal text
   (remarkHtmlAsText), never parsed. Presentational, no next-intl (mounted via /showcase). */
import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isBlockCode, remarkHtmlAsText } from "./helpers";
import { s } from "./styles";

const COMPONENTS: Components = {
  h1: ({ children }) => <h1 style={s.h1}>{children}</h1>,
  h2: ({ children }) => <h2 style={s.h2}>{children}</h2>,
  h3: ({ children }) => <h3 style={s.h3}>{children}</h3>,
  h4: ({ children }) => <h4 style={s.h3}>{children}</h4>,
  h5: ({ children }) => <h5 style={s.h3}>{children}</h5>,
  h6: ({ children }) => <h6 style={s.h3}>{children}</h6>,
  p: ({ children }) => <p style={s.p}>{children}</p>,
  ul: ({ children }) => <ul style={s.ul}>{children}</ul>,
  ol: ({ children, start }) => (
    <ol style={s.ol} start={start}>
      {children}
    </ol>
  ),
  li: ({ children }) => <li style={s.li}>{children}</li>,
  pre: ({ children }) => <pre style={s.pre}>{children}</pre>,
  code: ({ className, children }) => {
    const block = isBlockCode(className, String(children ?? ""));
    return (
      <code className={className} style={block ? s.blockCode : s.inlineCode}>
        {children}
      </code>
    );
  },
  strong: ({ children }) => <strong style={s.strong}>{children}</strong>,
  em: ({ children }) => <em style={s.em}>{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={s.a}>
      {children}
    </a>
  ),
  blockquote: ({ children }) => <blockquote style={s.blockquote}>{children}</blockquote>,
};

export function DocMarkdown({ children }: { children: string }) {
  if (!children) return null;
  return (
    <div style={s.root}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkHtmlAsText]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
