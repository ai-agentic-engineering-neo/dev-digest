"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
}

export function OverviewTab({ prBody, prId }: OverviewTabProps) {
  const t = useTranslations("brief.prBrief");
  return (
    <>
      <section>
        <SectionLabel icon="Sparkles">{t("title")}</SectionLabel>
        {/* Blast Radius mounts in the right column when built; until then Intent spans full width. */}
        <div style={s.briefGrid}>
          <div style={s.intentSlot}>
            <IntentCard prId={prId} />
          </div>
        </div>
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
