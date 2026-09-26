"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { s } from "./styles";

/**
 * Skill body editor — a fake filename header, an "unsaved" badge while the
 * body differs from the persisted one, a live token count, and a hand-written
 * line-numbered gutter synced to the textarea's scroll (no CodeMirror/Monaco
 * dependency in this repo — a plain <textarea> is enough for Markdown bodies).
 */
export function SkillBodyEditor({
  filename,
  value,
  onChange,
  dirty,
  tokens,
  tokensLoading,
}: {
  filename: string;
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
  tokens: number | null;
  tokensLoading: boolean;
}) {
  const t = useTranslations("skills");
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const lineCount = value.length === 0 ? 1 : value.split("\n").length;

  const syncScroll = () => {
    if (gutterRef.current && taRef.current) gutterRef.current.scrollTop = taRef.current.scrollTop;
  };

  return (
    <div style={s.editorPanel}>
      <div style={s.editorHeader}>
        <span className="mono" style={s.filename}>
          {filename}
        </span>
        {dirty && (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("config.unsaved")}
          </Badge>
        )}
        <span className="tnum" style={s.tokenCount}>
          {tokensLoading ? t("config.countingTokens") : tokens != null ? t("config.tokenCount", { count: tokens }) : "—"}
        </span>
      </div>
      <div style={s.editorBody}>
        <div ref={gutterRef} style={s.gutter} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={s.gutterLine}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={taRef}
          className="mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
          aria-label={t("config.bodyLabel")}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
