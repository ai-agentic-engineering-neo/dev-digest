/* Injection matches — the deterministic rule hits behind a block, so the user can see
   exactly which lines tripped the scan (rule id, severity, 1-based line, excerpt). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { InjectionMatch } from "@devdigest/shared";
import { s } from "./styles";

export function InjectionMatches({ matches }: { matches: InjectionMatch[] }) {
  const t = useTranslations("skills");
  if (matches.length === 0) return null;
  return (
    <section aria-label={t("injection.matches.title")} style={s.matches}>
      <h3 style={s.matchesTitle}>{t("injection.matches.title")}</h3>
      <p style={s.matchesHint}>{t("injection.matches.hint")}</p>
      <ul style={s.matchList}>
        {matches.map((m, i) => (
          <li key={`${m.rule}-${m.line}-${i}`} style={s.matchItem}>
            <div style={s.matchMeta}>
              <span className="mono" style={s.matchRule}>
                {m.rule}
              </span>
              <span style={s.matchSeverity(m.severity)}>{t(`injection.matches.severity.${m.severity}`)}</span>
              <span style={s.matchLine}>{t("injection.matches.line", { line: m.line })}</span>
            </div>
            <code className="mono" style={s.matchExcerpt}>
              {m.excerpt}
            </code>
          </li>
        ))}
      </ul>
    </section>
  );
}
