/* FindingsTab — the "Agent runs" tab: live runs, Lethal Trifecta alert, the
   runs & commits timeline and one accordion per review run. Reads the PR's
   run/review queries itself (TanStack dedupes them with the header's). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, SectionLabel, EmptyState } from "@devdigest/ui";
import type { PrCommit } from "@devdigest/shared";
import { useDeleteRun, usePrActiveRuns, usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import { RunHistory } from "../RunHistory";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import { findingsByRunId, keyboardReviewId, lethalTrifectaCount } from "./helpers";
import { LiveReview } from "./_components/LiveReview";
import { s } from "./styles";

interface FindingsTabProps {
  prId: string;
  commits: PrCommit[];
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (runId: string) => void;
}

export function FindingsTab({ prId, commits, repoFullName, headSha, onOpenTrace }: FindingsTabProps) {
  const t = useTranslations("prReview");
  // Live runs are SERVER-SOURCED (agent_runs status='running'): they survive
  // navigation and reload; the run/cancel mutations and SSE refresh them.
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const { data: reviews } = usePrReviews(prId);
  const deleteRun = useDeleteRun(prId);

  const runs = reviews ?? [];
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const lethalCount = lethalTrifectaCount(runs);
  // run_id → findings, for the timeline's severity counters and hover popover.
  const findingsByRun = React.useMemo(() => findingsByRunId(reviews ?? []), [reviews]);

  // Timeline → Review runs: clicking an agent name opens + scrolls to its
  // accordion. The nonce re-triggers the scroll when the same run is clicked twice.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const goToReview = (runId: string) => setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));

  // Only one open run's FindingsPanel owns j/k/a/d (see keyboardReviewId).
  const [chosenReviewId, setChosenReviewId] = React.useState<string | null>(null);
  const activeReviewId = keyboardReviewId(runs, chosenReviewId);

  const deleteFromHistory = (runId: string) => {
    if (window.confirm(t("findingsTab.confirmDeleteRun"))) deleteRun.mutate(runId);
  };

  return (
    <section>
      <LiveReview prId={prId} runIds={liveRunIds} onOpenTrace={onOpenTrace} />

      {lethalCount > 0 && (
        <div role="alert" style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={s.critIcon} />
          <span style={s.lethalTrifectaTitle}>{t("findingsTab.lethalTrifecta")}</span>
          <Badge color="var(--crit)" bg="transparent">
            {t("findingsTab.lethalCount", { count: lethalCount })}
          </Badge>
        </div>
      )}

      {((prRuns?.length ?? 0) > 0 || commits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel icon="Activity" right={<span style={s.sectionHint}>{t("findingsTab.timelineHint")}</span>}>
            {t("findingsTab.timeline")}
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            findingsByRun={findingsByRun}
            commits={commits}
            onOpenTrace={onOpenTrace}
            onGoToReview={goToReview}
            onDelete={deleteFromHistory}
          />
        </div>
      )}

      <SectionLabel icon="AlertOctagon" right={<span style={s.sectionHint}>{t("findingsTab.reviewRunsHint")}</span>}>
        {t("findingsTab.reviewRuns")}
      </SectionLabel>
      {runs.length === 0
        ? liveRunIds.length === 0 && (
            <EmptyState icon="Sparkles" title={t("findingsTab.emptyTitle")} body={t("findingsTab.emptyBody")} />
          )
        : runs.map((review, i) => (
            <ReviewRunAccordion
              key={review.id}
              review={review}
              prId={prId}
              defaultOpen={i === 0}
              repoFullName={repoFullName}
              headSha={headSha}
              targetRunId={target?.runId ?? null}
              targetNonce={target?.n ?? 0}
              active={review.id === activeReviewId}
              onActivate={() => setChosenReviewId(review.id)}
            />
          ))}
    </section>
  );
}
