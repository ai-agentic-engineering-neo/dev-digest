"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Onboarding } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { relativeTime } from "@/lib/relative-time";
import { refreshedWhen } from "../OnboardingTourView/helpers";
import { s } from "./styles";

interface TourHeaderProps {
  repoName: string;
  tour: Onboarding | null;
  stale: boolean;
  /** "provider/model" shown in the Regenerate tooltip. */
  modelLabel: string | null;
  /** False when the repo has no clone: Regenerate is replaced by a note. */
  cloned: boolean;
  running: boolean;
  onRegenerate: () => void;
  onShare: () => void;
}

/** Title, subtitle (index size, refresh time, model, cost), stale hint and the Regenerate / Share actions. */
export function TourHeader({ repoName, tour, stale, modelLabel, cloned, running, onRegenerate, onShare }: TourHeaderProps) {
  const t = useTranslations("onboarding");
  const when = tour
    ? refreshedWhen(relativeTime(tour.generated_at), { justNow: t("justNow"), ago: (w) => t("ago", { when: w }) })
    : "";
  const files = tour ? tour.files_indexed.toLocaleString("en-US") : "";
  return (
    <div style={s.wrap}>
      <div>
        <h1 style={s.title}>
          {t("titlePrefix")}{" "}
          <span className="mono" style={s.name}>
            {repoName}
          </span>
        </h1>
        {tour ? (
          <p style={s.subtitle}>
            {t(tour.limited ? "subtitleLimited" : "subtitle", { files, when })}
            {" · "}
            {t("subtitleModel", { model: tour.model ?? "—", cost: formatCost(tour.cost_usd) })}
            {stale ? <span style={s.stale}>{t("stale")}</span> : null}
          </p>
        ) : null}
      </div>
      <div style={s.actions}>
        {cloned && (tour || running) ? (
          <Button
            icon="RefreshCw"
            loading={running}
            disabled={running}
            onClick={onRegenerate}
            title={modelLabel ? t("regenerateTooltip", { model: modelLabel }) : undefined}
          >
            {running ? t("regenerating") : t("regenerate")}
          </Button>
        ) : !cloned && tour ? (
          <span style={s.note}>{t("notCloned.note")}</span>
        ) : null}
        {tour ? (
          <Button icon="Link" onClick={onShare} title={t("shareTooltip")}>
            {t("shareLink")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
