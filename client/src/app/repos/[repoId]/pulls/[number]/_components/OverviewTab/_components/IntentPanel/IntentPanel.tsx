/* IntentPanel — container: loads the PR intent and wires the card's actions to mutations. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import {
  usePrIntent,
  useRefreshIntent,
  useResetIntent,
  useSaveIntentOverride,
} from "@/lib/hooks/intent";
import { IntentCard } from "./_components/IntentCard";
import { s } from "./styles";

const SKELETON_HEIGHT = 120;

export function IntentPanel({
  prId,
  repoFullName,
  reviewRunning = false,
}: {
  prId: string;
  repoFullName: string | null;
  reviewRunning?: boolean;
}) {
  const t = useTranslations("brief");
  const { data, isLoading, isError, refetch } = usePrIntent(prId, { live: reviewRunning });
  const refresh = useRefreshIntent(prId);
  const save = useSaveIntentOverride(prId);
  const reset = useResetIntent(prId);

  if (isLoading) return <Skeleton height={SKELETON_HEIGHT} />;

  if (isError) {
    return <ErrorState title={t("intent.loadError")} onRetry={() => refetch()} />;
  }

  if (!data) {
    const analysing = reviewRunning || refresh.isPending;
    return (
      <div style={s.empty}>
        <div style={s.emptyTitle}>{analysing ? t("intent.empty.analysing") : t("intent.empty.title")}</div>
        <p style={s.emptyBody}>{t("intent.empty.body")}</p>
        {!analysing && (
          <div>
            <Button kind="ghost" size="sm" icon="RefreshCw" onClick={() => refresh.mutate()}>
              {t("intent.empty.cta")}
            </Button>
          </div>
        )}
      </div>
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
