/* IntentPanel — container: loads the PR intent and wires the card's actions to mutations. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import {
  usePrIntent,
  useRefreshIntent,
  useResetIntent,
  useSaveIntentOverride,
} from "@/lib/hooks/intent";
import { IntentCard } from "./_components/IntentCard";

const SKELETON_HEIGHT = 120;

export function IntentPanel({ prId, repoFullName }: { prId: string; repoFullName: string | null }) {
  const t = useTranslations("brief");
  const { data, isLoading, isError, refetch } = usePrIntent(prId);
  const refresh = useRefreshIntent(prId);
  const save = useSaveIntentOverride(prId);
  const reset = useResetIntent(prId);

  if (isLoading) return <Skeleton height={SKELETON_HEIGHT} />;

  if (isError) {
    return <ErrorState title={t("intent.loadError")} onRetry={() => refetch()} />;
  }

  if (!data) {
    return (
      <EmptyState
        icon="FileText"
        title={t("intent.empty.title")}
        body={t("intent.empty.body")}
        cta={t("intent.empty.cta")}
        onCta={() => refresh.mutate()}
        ctaLoading={refresh.isPending}
      />
    );
  }

  return (
    <IntentCard
      intent={data}
      repoFullName={repoFullName}
      actions={{
        onRefresh: () => refresh.mutate(),
        onSaveOverride: (input) => save.mutateAsync(input).then(() => undefined),
        onResetOverride: () => reset.mutate(),
        refreshing: refresh.isPending,
        saving: save.isPending,
        resetting: reset.isPending,
      }}
    />
  );
}
