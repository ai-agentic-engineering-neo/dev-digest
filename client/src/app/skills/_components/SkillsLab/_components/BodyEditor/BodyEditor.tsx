/* BodyEditor — the skill body editor from the Config design: a `<name>.md`
   header with an `unsaved` badge and the token estimate, then a line-numbered
   monospace textarea. No wrapping, so gutter numbers always match lines; the
   gutter and the text scroll together inside one scroll box. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { approxTokens } from "@/lib/tokens";
import { LINE_HEIGHT, MIN_LINES } from "./constants";
import { s } from "./styles";

export function BodyEditor({
  fileName,
  value,
  onChange,
  dirty,
  placeholder,
  label,
}: {
  fileName: string;
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
  placeholder?: string;
  label: string;
}) {
  const t = useTranslations("skills");
  const lines = Math.max(value.split("\n").length, MIN_LINES);
  return (
    <div style={s.box}>
      <div style={s.head}>
        <Icon.FileText size={14} />
        <span className="mono" style={s.file}>
          {fileName}.md
        </span>
        {dirty && <span style={s.unsaved}>{t("config.unsaved")}</span>}
        <span style={s.tokens}>{t("config.tokens", { count: approxTokens(value) })}</span>
      </div>
      <div style={s.scroll}>
        <div style={s.gutter} aria-hidden>
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} style={s.lineNo}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          className="mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          wrap="off"
          spellCheck={false}
          style={{ ...s.textarea, height: lines * LINE_HEIGHT + 2 * 12 }}
        />
      </div>
    </div>
  );
}
