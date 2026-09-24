"use client";

import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string;
  prBody: string | null | undefined;
  repoFullName: string | null;
  headSha: string | null;
}

export function OverviewTab({ prId, prBody, repoFullName, headSha }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <div style={s.stack}>
      <IntentCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("overview.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </div>
  );
}
