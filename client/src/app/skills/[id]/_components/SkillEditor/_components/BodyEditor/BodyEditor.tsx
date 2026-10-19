/* BodyEditor — markdown body editor with a line-number gutter and heading
   tint. A transparent <textarea> sits over a rendered copy of the text: both
   share font metrics and wrapping, so every wrapped line keeps its number. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { approxTokens } from "../../../../../../../lib/approx-tokens";
import { classifyLines } from "./helpers";
import { s } from "./styles";

export function BodyEditor({
  fileName,
  value,
  onChange,
  dirty,
  label,
}: {
  fileName: string;
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
  label: string;
}) {
  const t = useTranslations("skills");
  const lines = classifyLines(value);
  return (
    <div style={s.frame}>
      <div style={s.head}>
        <Icon.FileText size={13} style={s.fileIcon} />
        <span className="mono" style={s.fileName}>
          {fileName}
        </span>
        {dirty && <Badge color="var(--text-muted)">{t("config.unsaved")}</Badge>}
        <span className="mono" style={s.tokens}>
          {t("config.tokens", { count: approxTokens(value).toLocaleString("en-US") })}
        </span>
      </div>
      <div style={s.area}>
        <div aria-hidden>
          {lines.map((ln, i) => (
            <div key={i} style={s.row}>
              <span style={s.num}>{i + 1}</span>
              {/* Zero-width space keeps an empty line one row tall. */}
              <span style={s.line(ln.kind)}>{ln.text || "​"}</span>
            </div>
          ))}
        </div>
        <textarea
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          style={s.input}
        />
      </div>
    </div>
  );
}
