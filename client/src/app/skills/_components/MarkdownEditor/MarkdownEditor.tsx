/* MarkdownEditor — the skill body editor: a filename header with an "unsaved"
   marker and a token estimate, a line-number gutter, and a monospace textarea.
   No syntax highlighting: the body is prompt text, and a second rendering of it
   already exists on the Preview tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { approxTokens } from "@/lib/tokens";
import { LINE_HEIGHT_PX, s } from "./styles";

export function MarkdownEditor({
  filename,
  value,
  onChange,
  dirty,
  rows = 18,
}: {
  filename: string;
  value: string;
  onChange: (v: string) => void;
  dirty?: boolean;
  rows?: number;
}) {
  const t = useTranslations("skills");
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;

  // The gutter is a separate element, so it has to follow the textarea's scroll
  // or the numbers drift out of line as soon as the body is taller than the box.
  const syncScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
  };

  return (
    <div style={s.frame}>
      <div style={s.head}>
        <span className="mono" style={s.filename}>
          {filename}
        </span>
        {dirty && <Badge color="var(--warn)" bg="var(--warn-bg)">{t("config.unsaved")}</Badge>}
        <span style={s.tokens}>{t("config.tokens", { count: approxTokens(value) })}</span>
      </div>
      <div style={s.body}>
        <div ref={gutterRef} style={{ ...s.gutter, maxHeight: rows * LINE_HEIGHT_PX + 20 }}>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
          aria-label={filename}
          style={{ ...s.textarea, height: rows * LINE_HEIGHT_PX + 20 }}
        />
      </div>
    </div>
  );
}
