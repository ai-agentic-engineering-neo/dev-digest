"use client";

import { useTranslations } from "next-intl";
import type { OpenDiffTarget } from "@/components/diff-viewer";
import type { BriefRisk } from "@/lib/types";
import { BriefSectionLabel } from "../BriefSectionLabel";
import { RiskCard } from "./_components/RiskCard";
import { s } from "./styles";

/** "Risk areas" block of the brief: compact expandable cards, each with severity, plain-text explanation and grounded file refs. */
export function RiskAreas({
  risks,
  repoFullName,
  linkSha,
  onOpenFile,
}: {
  risks: BriefRisk[];
  repoFullName: string | null;
  linkSha: string | null;
  onOpenFile: OpenDiffTarget;
}) {
  const t = useTranslations("brief");

  return (
    <section style={s.root}>
      <BriefSectionLabel icon="AlertTriangle">{t("block.risks")}</BriefSectionLabel>
      {risks.length === 0 ? (
        <p style={s.empty}>{t("noRisks")}</p>
      ) : (
        <ul style={s.list}>
          {risks.map((risk, i) => (
            <RiskCard
              key={`${i}:${risk.title}`}
              risk={risk}
              repoFullName={repoFullName}
              linkSha={linkSha}
              onOpenFile={onOpenFile}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
