/* PrBriefCard — the first card of the Overview tab, laid out like VerdictBanner:
   the review's verdict tile, the counts badge, the model's summary, and on the
   right the regenerate control, the score ring and the cost of the one call
   that wrote the brief. Verdict, score and counts come from the newest review
   at read time, never from the brief model. Model text is rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, CircularScore, ErrorState, Icon, IconBtn, Skeleton } from "@devdigest/ui";
import { useGenerateBrief, usePrBrief } from "@/lib/hooks/brief";
import { useSettings } from "@/lib/hooks/core";
import { featureModelFor } from "@/lib/feature-models";
import { VERDICT_META } from "@/app/repos/[repoId]/pulls/[number]/constants";
import { InfoPopover } from "./_components/InfoPopover";
import {
  COUNT_BADGE_COLOR,
  NEUTRAL_TILE,
  REGENERATE_ICON_SIZE,
  SCORE_SIZE,
  SCORE_STROKE,
  SKELETON_HEIGHT,
  STALE_BADGE,
  VERDICT_ICON_SIZE,
} from "./constants";
import { costLine, isRunning, modelLabel, storedModelLabel } from "./helpers";
import { s } from "./styles";

export function PrBriefCard({
  prId,
  onOpenTrace,
}: {
  prId: string | null;
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("brief.card");
  const tv = useTranslations("prReview");
  const { data, isLoading, isError, refetch } = usePrBrief(prId);
  const generate = useGenerateBrief(prId);
  const { data: settings } = useSettings();
  const choice = featureModelFor(settings, "risk_brief");
  const currentModel = modelLabel(choice);

  if (isLoading) {
    return (
      <Card>
        <Skeleton height={SKELETON_HEIGHT} />
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <ErrorState title={t("loadFailed")} onRetry={() => refetch()} />
      </Card>
    );
  }

  const { brief, review, run, stale } = data;
  const running = isRunning(run, generate.isPending);
  const failedText = !running && run?.status === "failed" && run.error ? t("runFailed", { error: run.error }) : null;
  const start = () => {
    if (!running && prId) generate.mutate();
  };

  if (!brief) {
    return (
      <Card>
        <div aria-busy={running}>
          <div style={s.center}>
            <Button
              kind="primary"
              size="sm"
              icon="Sparkles"
              loading={running}
              disabled={running || !prId}
              title={t("generateHint", { model: currentModel })}
              onClick={start}
            >
              {running ? t("generating") : t("generate")}
            </Button>
          </div>
          {failedText && (
            <p role="alert" style={s.error}>
              {failedText}
            </p>
          )}
        </div>
      </Card>
    );
  }

  const meta = review?.verdict ? (VERDICT_META[review.verdict] ?? VERDICT_META.comment) : null;
  const VIcon = meta ? Icon[meta.icon] : Icon.Clock;
  const tile = meta ? { color: meta.c, bg: meta.bg } : NEUTRAL_TILE;
  const storedModel = storedModelLabel(brief);
  const traceRunId = brief.run_id ?? run?.run_id ?? null;
  const line = costLine(brief);
  const costText = (
    <>
      <Icon.DollarSign size={12} />
      <span className="mono tnum">{line.cost}</span>
      <span className="mono tnum">{line.tokens}</span>
    </>
  );

  return (
    <Card>
      <div aria-busy={running} style={s.wrap}>
        <div style={s.iconBox(tile.bg, tile.color)}>
          <VIcon size={VERDICT_ICON_SIZE} />
        </div>

        <div style={s.main}>
          <div style={s.titleRow}>
            <span style={s.label(tile.color)}>{meta ? tv(`verdict.${meta.labelKey}`) : t("notReviewed")}</span>
            {review && (
              <Badge color={COUNT_BADGE_COLOR}>
                {t("counts", { findings: review.findings_count, blockers: review.blockers })}
              </Badge>
            )}
            <InfoPopover review={review} model={storedModel} />
            {stale && (
              <Badge color={STALE_BADGE.color} bg={STALE_BADGE.bg} icon="AlertTriangle">
                {t("outOfDate")}
              </Badge>
            )}
          </div>
          <p style={s.summary}>{brief.summary}</p>
          {!review && <p style={s.hint}>{t("notReviewedHint")}</p>}
          {stale && <p style={s.hint}>{t("staleHint")}</p>}
          {brief.files_included < brief.files_total && (
            <p style={s.hint}>{t("basedOn", { included: brief.files_included, total: brief.files_total })}</p>
          )}
          {failedText && (
            <p role="alert" style={s.error}>
              {failedText}
            </p>
          )}
        </div>

        <div style={s.side}>
          {running ? (
            <Badge icon="RefreshCw">{t("generating")}</Badge>
          ) : (
            <IconBtn icon="RefreshCw" label={t("regenerate", { model: currentModel })} size={REGENERATE_ICON_SIZE} onClick={start} />
          )}
          {review?.score != null && (
            <div style={s.scoreCol}>
              <CircularScore score={review.score} size={SCORE_SIZE} stroke={SCORE_STROKE} />
              <span style={s.scoreLabel}>{t("score")}</span>
            </div>
          )}
          {traceRunId ? (
            <button
              type="button"
              style={s.costBtn}
              aria-label={t("costLine", { cost: line.cost, tokens: line.tokens, model: storedModel })}
              onClick={() => onOpenTrace(traceRunId)}
            >
              {costText}
            </button>
          ) : (
            <span style={s.cost}>{costText}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
