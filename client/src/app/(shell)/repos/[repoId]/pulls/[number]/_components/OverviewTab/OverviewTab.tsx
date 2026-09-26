"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { useIntent, useRecomputeIntent } from "@/lib/hooks";
import { IntentCard } from "./_components/IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  headSha: string | null | undefined;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, headSha, prBody }: OverviewTabProps) {
  const t = useTranslations("prReview");
  const { data: intent, isLoading, isError } = useIntent(prId);
  const recompute = useRecomputeIntent(prId);
  return (
    <>
      <IntentCard
        intent={intent}
        isLoading={isLoading}
        isError={isError}
        headSha={headSha}
        onRecompute={() => recompute.mutate()}
        recomputing={recompute.isPending}
      />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("detail.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
