/* SkillBodyEditor — the skill body as a plain monospace textarea with a
   line-number gutter that scrolls with it. The header shows `<name>.md`, an
   `unsaved` badge and the token count. Used by Config, Create and Import. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { EDITOR_ROWS } from "./constants";
import { lineNumbers, tokenLabel } from "./helpers";
import { s } from "./styles";

export function SkillBodyEditor({
  name,
  value,
  onChange,
  unsaved,
  serverTokens,
  placeholder,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  unsaved?: boolean;
  /** The server's token count for this exact body; `null` while it is edited. */
  serverTokens?: number | null;
  placeholder?: string;
}) {
  const t = useTranslations("skills");
  const gutterRef = React.useRef<HTMLPreElement>(null);
  const tokens = tokenLabel(value, serverTokens);
  return (
    <div style={s.box}>
      <div style={s.head}>
        <Icon.FileText size={14} style={s.headIcon} />
        <span className="mono" style={s.fileName}>
          {t("editor.fileName", { name: name.trim() || t("editor.untitled") })}
        </span>
        {unsaved && <Badge color="var(--warn)" bg="var(--warn-bg)">{t("editor.unsaved")}</Badge>}
        <span className="mono" style={s.tokens}>
          {t(`editor.${tokens.key}`, { count: tokens.count })}
        </span>
      </div>
      <div style={s.body}>
        <pre ref={gutterRef} className="mono" style={s.gutter} aria-hidden="true">
          {lineNumbers(value).join("\n")}
        </pre>
        <textarea
          className="mono"
          aria-label={t("fields.body")}
          value={value}
          rows={EDITOR_ROWS}
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
