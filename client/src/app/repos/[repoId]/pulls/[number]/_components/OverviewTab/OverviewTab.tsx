"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { usePrBrief } from "@/lib/hooks/brief";
import { IntentCard } from "./_components/IntentCard";
import { PrBriefCard } from "./_components/PrBriefCard";
import { ReviewFocusCard } from "./_components/ReviewFocusCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  repoId: string | null;
  repoFullName: string | null;
  prBody: string | null | undefined;
  /** Opens the run trace drawer for a brief run. */
  onOpenTrace: (runId: string) => void;
  /** Opens Files changed at a path and optional line. */
  onOpenDiff: (path: string, line: number | null) => void;
}

export function OverviewTab({ prId, repoId, repoFullName, prBody, onOpenTrace, onOpenDiff }: OverviewTabProps) {
  const t = useTranslations("intent");
  // Same query key as the card: one request, shared cache.
  const { data: briefView } = usePrBrief(prId);
  const brief = briefView?.brief ?? null;
  return (
    <>
      <section style={s.section}>
        <SectionLabel icon="FileText">{t("brief")}</SectionLabel>
        <PrBriefCard prId={prId} onOpenTrace={onOpenTrace} />
        <div style={s.briefGrid}>
          <IntentCard prId={prId} repoFullName={repoFullName} risks={brief?.risks} onOpenRef={onOpenDiff} />
          <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} />
        </div>
        {brief && <ReviewFocusCard items={brief.review_focus} onOpen={onOpenDiff} />}
      </section>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
