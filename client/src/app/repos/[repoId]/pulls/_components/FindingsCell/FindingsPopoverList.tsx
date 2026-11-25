/* FindingsPopoverList — the brief findings list shown in the PR list's FINDINGS
   popover: severity icon, title, category, file:line, confidence, rationale. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CategoryTag, ConfidenceNum, Icon, SEV, Skeleton, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { formatFindingLocation } from "../../helpers";
import { s } from "./styles";

export function FindingsPopoverList({
  findings,
  loading,
  error,
}: {
  findings: FindingRecord[];
  loading: boolean;
  error: boolean;
}) {
  const t = useTranslations("prReview");
  if (loading) {
    return (
      <div style={s.state} aria-label={t("list.findings.loading")}>
        <Skeleton height={12} style={{ marginBottom: 8 }} />
        <Skeleton height={12} width="70%" />
      </div>
    );
  }
  if (error) return <div style={s.state}>{t("list.findings.error")}</div>;
  if (findings.length === 0) return <div style={s.state}>{t("list.findings.empty")}</div>;

  return (
    <ul style={s.list}>
      {findings.map((f) => {
        const sev = SEV[f.severity];
        const SevIcon = Icon[sev.icon];
        return (
          <li key={f.id} style={s.item}>
            <span style={s.sevBox(sev.c, sev.bg)} title={sev.label}>
              <SevIcon size={13} aria-hidden />
            </span>
            <div style={s.body}>
              <div style={s.titleRow}>
                <span style={s.title}>{f.title}</span>
                <CategoryTag category={f.category as Category} />
              </div>
              <div style={s.meta}>
                <span className="mono" style={s.location}>
                  {formatFindingLocation(f)}
                </span>
                <ConfidenceNum value={f.confidence} />
              </div>
              {f.rationale && <div style={s.rationale}>{f.rationale}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
