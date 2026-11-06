"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { githubIssueUrl } from "@/lib/github-urls";
import type { IntentSource } from "@/lib/types";
import { isDimmed } from "../../helpers";
import { s } from "./styles";

export function SourceChips({
  sources,
  repoFullName,
}: {
  sources: IntentSource[];
  repoFullName: string | null;
}) {
  const t = useTranslations("brief");
  if (sources.length === 0) return null;

  return (
    <ul aria-label={t("intent.sourcesLabel")} style={s.list}>
      {sources.map((src) => {
        const dimmed = isDimmed(src);
        const label = t(`intent.source.${src.kind}`, { ref: src.ref });
        const isPath = src.kind === "plan" || src.kind === "spec" || src.kind === "doc";
        const href =
          src.kind === "issue" && src.issue_number !== null && repoFullName
            ? githubIssueUrl(repoFullName, src.issue_number)
            : null;
        const note = dimmed
          ? ` · ${t(`intent.sourceStatus.${src.status}`)}${src.reason ? ` (${t(`intent.sourceReason.${src.reason}`)})` : ""}`
          : "";
        return (
          <li key={src.id} style={s.chip(dimmed)}>
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" style={s.link}>
                {label}
              </a>
            ) : (
              <span className={isPath ? "mono" : undefined}>{label}</span>
            )}
            {note && <span>{note}</span>}
          </li>
        );
      })}
    </ul>
  );
}
