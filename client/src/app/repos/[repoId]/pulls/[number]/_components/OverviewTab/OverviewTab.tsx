"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentPanel } from "./_components/IntentPanel";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoFullName: string | null;
  /** A review is running for this PR — the intent panel polls until the run has derived it. */
  reviewRunning?: boolean;
}

export function OverviewTab({ prId, prBody, repoFullName, reviewRunning = false }: OverviewTabProps) {
  const t = useTranslations("brief");
  return (
    <>
      {prId && (
        <section>
          <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
          <IntentPanel prId={prId} repoFullName={repoFullName} reviewRunning={reviewRunning} />
        </section>
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
