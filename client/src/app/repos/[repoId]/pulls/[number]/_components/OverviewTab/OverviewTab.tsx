"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { BlastRadiusPanel } from "./_components/BlastRadiusPanel";
import { IntentPanel } from "./_components/IntentPanel";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoFullName: string | null;
  repoId: string;
  /** A review is running for this PR — the intent panel polls until the run has derived it. */
  reviewRunning?: boolean;
}

export function OverviewTab({ prId, prBody, repoFullName, repoId, reviewRunning = false }: OverviewTabProps) {
  const t = useTranslations("brief");
  return (
    <>
      {prId && (
        // Two equal-height columns when wide, stacked when narrow (auto-fit, no media query).
        <div style={s.columns}>
          <section style={s.column}>
            <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
            <IntentPanel prId={prId} repoFullName={repoFullName} reviewRunning={reviewRunning} />
          </section>
          <section style={s.column}>
            <SectionLabel icon="Workflow">{t("block.blast")}</SectionLabel>
            <BlastRadiusPanel prId={prId} repoId={repoId} repoFullName={repoFullName} />
          </section>
        </div>
      )}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
