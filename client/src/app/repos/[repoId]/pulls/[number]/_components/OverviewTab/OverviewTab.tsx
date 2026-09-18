"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { ReviewRecord } from "@devdigest/shared";
import { VerdictBanner } from "../VerdictBanner";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  /** Newest-first, as returned by `GET /pulls/:id/reviews`. */
  reviews?: ReviewRecord[];
  repoFullName: string | null;
  headSha: string | null | undefined;
}

export function OverviewTab({ prBody, prId, reviews, repoFullName, headSha }: OverviewTabProps) {
  const t = useTranslations("prReview");
  const latestReview = reviews?.[0];
  const blockers = latestReview
    ? latestReview.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length
    : 0;

  return (
    <>
      {latestReview?.verdict && (
        <section>
          <SectionLabel icon="FileText">{t("prBrief.sectionLabel")}</SectionLabel>
          <VerdictBanner
            verdict={latestReview.verdict}
            summary={latestReview.summary}
            score={latestReview.score}
            findingsCount={latestReview.findings.length}
            blockers={blockers}
            agentName={latestReview.agent_name}
          />
        </section>
      )}

      <div style={s.grid}>
        <IntentCard prId={prId} />
        <BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
