"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Skeleton } from "@devdigest/ui";
import { useGenerateBrief, usePrBrief } from "@/lib/hooks/brief";
import { BlastRadiusPanel } from "./_components/BlastRadiusPanel";
import { IntentPanel } from "./_components/IntentPanel";
import { PrBriefCard } from "./_components/PrBriefCard";
import { ReviewFocusList } from "./_components/ReviewFocusList";
import { RiskAreas } from "./_components/RiskAreas";
import type { OpenDiffTarget } from "@/components/diff-viewer";
import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import { toBriefVerdict } from "./helpers";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoFullName: string | null;
  repoId: string;
  /** A review is running for this PR — the intent panel polls until the run has derived it. */
  reviewRunning?: boolean;
  /** Opens a changed file in the Files changed tab. */
  onOpenFile: OpenDiffTarget;
}

const SLOT_SKELETON_HEIGHT = 80;

export function OverviewTab({ prId, prBody, repoFullName, repoId, reviewRunning = false, onOpenFile }: OverviewTabProps) {
  const t = useTranslations("brief");
  const briefQuery = usePrBrief(prId);
  const generate = useGenerateBrief(prId ?? "");
  const data = briefQuery.data;
  const brief = data?.brief ?? null;
  const generating = generate.isPending || !!data?.generating;
  const linkSha = brief?.blast_link_sha ?? null;
  const awaitingBrief = !brief && generating;
  const reviewsQuery = usePrReviews(prId);
  const runsQuery = usePrRuns(prId);
  const verdict = toBriefVerdict({
    reviews: reviewsQuery.data,
    runs: runsQuery.data,
    failed: reviewsQuery.isError || runsQuery.isError,
  });

  return (
    <>
      {prId && (
        <PrBriefCard
          data={data}
          loadError={briefQuery.isError}
          generating={generating}
          generateError={generate.error}
          onGenerate={() => generate.mutate()}
          onRetryLoad={() => briefQuery.refetch()}
          verdict={verdict}
          onRetryVerdict={() => {
            reviewsQuery.refetch();
            runsQuery.refetch();
          }}
        />
      )}
      {prId && (
        // Two equal-height columns when wide, stacked when narrow (auto-fit, no media query).
        <div style={s.columns}>
          <section style={s.column}>
            <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
            <div style={s.stack}>
              <IntentPanel prId={prId} repoFullName={repoFullName} reviewRunning={reviewRunning} />
              {brief && (
                <RiskAreas risks={brief.risks} repoFullName={repoFullName} linkSha={linkSha} onOpenFile={onOpenFile} />
              )}
              {awaitingBrief && <Skeleton height={SLOT_SKELETON_HEIGHT} />}
            </div>
          </section>
          <section style={s.column}>
            <SectionLabel icon="Workflow">{t("block.blast")}</SectionLabel>
            <BlastRadiusPanel prId={prId} repoId={repoId} repoFullName={repoFullName} />
          </section>
        </div>
      )}
      {brief && (
        <ReviewFocusList items={brief.review_focus} repoFullName={repoFullName} linkSha={linkSha} onOpenFile={onOpenFile} />
      )}
      {awaitingBrief && <Skeleton height={SLOT_SKELETON_HEIGHT} />}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
