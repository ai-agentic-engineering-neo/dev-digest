/* MarkdownEditor — <textarea> layered over a syntax-highlighted <pre>, sharing
   a line-number gutter. No editor dependency: there is none in this client and
   ~200 KB of CodeMirror for one field is not the trade this app wants.

   Presentational on purpose. The token count is passed in (ConfigTab owns the
   debounced `POST /skills/tokens` call via `useTokenCount`) so this component
   renders in RTL without a query client or a network stub. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { highlightMarkdown, lineCount, skillFilename } from "./helpers";
import { s, TOKEN_STYLE } from "./styles";

export function MarkdownEditor({
  value,
  onChange,
  slug,
  dirty,
  tokens,
  height = 340,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Skill slug — the filename chip renders `<slug>.md`. */
  slug: string;
  /** Body differs from the saved one; shows the `unsaved` badge. */
  dirty?: boolean;
  /** Last SETTLED tokenizer count, or null before the first one lands. */
  tokens: number | null;
  height?: number;
}) {
  const t = useTranslations("skills");
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const preRef = React.useRef<HTMLPreElement>(null);

  const lines = React.useMemo(() => highlightMarkdown(value), [value]);
  const count = lineCount(value);

  // Scroll sync: the textarea is the only scrollable layer; the overlay and the
  // gutter are dragged along. Direct node writes, not state — this fires on
  // every scroll frame and a re-render per frame would drop the caret.
  const onScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = el.scrollTop;
      preRef.current.scrollLeft = el.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
  };

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <span className="mono" style={s.filename}>
          {skillFilename(slug)}
        </span>
        {dirty && <Badge color="var(--warn)">{t("markdown.unsaved")}</Badge>}
        <span style={s.headSpacer} />
        <span className="tnum" style={s.tokens}>
          {tokens == null ? t("markdown.tokensPending") : t("markdown.tokens", { count: tokens })}
        </span>
      </div>

      <div style={s.body(height)}>
        <div ref={gutterRef} aria-hidden style={s.gutter} data-testid="md-gutter">
          {Array.from({ length: count }, (_, i) => `${i + 1}\n`).join("")}
        </div>

        <div style={s.editArea}>
          <pre ref={preRef} aria-hidden style={s.highlight}>
            {lines.map((toks, i) => (
              <React.Fragment key={i}>
                {toks.map((tok, j) => (
                  <span key={j} style={TOKEN_STYLE[tok.kind]}>
                    {tok.text}
                  </span>
                ))}
                {"\n"}
              </React.Fragment>
            ))}
          </pre>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={onScroll}
            wrap="off"
            spellCheck={false}
            aria-label={t("config.body")}
            style={s.textarea}
          />
        </div>
      </div>
    </div>
  );
}
