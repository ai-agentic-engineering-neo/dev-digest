/* RiskArea — one risk in the RISK AREAS list (AC-37). Collapsed: severity +
   kind + title + file refs. Expanded (aria-expanded button): the explanation.
   File-ref citations ALWAYS link to the repository host, pinned to the
   brief's OWN provenance head sha — a risk may cite a downstream caller file
   this PR does not change (AC-16), which by definition has no in-app diff
   target (plans/11-why-risk-brief.md §7). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Markdown, MonoLink } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { RISK_KIND_META, SEVERITY_COLOR } from "./constants";
import { splitFileRef } from "./helpers";
import { s } from "./styles";

export function RiskArea({
  risk,
  repoFullName,
  headSha,
}: {
  risk: Risk;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("brief");
  const [expanded, setExpanded] = React.useState(false);
  const meta = RISK_KIND_META[risk.kind];
  const I = Icon[meta.icon];
  const sevColor = SEVERITY_COLOR[risk.severity];

  return (
    <div style={s.riskCard}>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)} style={s.riskHeader}>
        <span style={s.sevDot(sevColor)} aria-hidden />
        <span style={s.sevLabel(sevColor)}>{t(`risk.level.${risk.severity}`)}</span>
        <I size={14} style={{ color: meta.color, flexShrink: 0 }} />
        <span style={s.kindLabel}>{t(`risk.kind.${risk.kind}`)}</span>
        <span style={s.riskTitle}>{risk.title}</span>
        <Icon.ChevronDown size={14} style={s.chevron(expanded)} />
      </button>
      {expanded && (
        <div style={s.riskBody}>
          <div style={s.prose}>
            <Markdown>{risk.explanation}</Markdown>
          </div>
          {risk.file_refs.length > 0 && (
            <div style={s.refRow}>
              {risk.file_refs.map((ref) => {
                const { file, line } = splitFileRef(ref);
                const href =
                  repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, file, line, line) : undefined;
                return (
                  <MonoLink key={ref} href={href}>
                    {ref}
                  </MonoLink>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
