"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";

export default function PrDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("prReview");
  const tc = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <AppShell>
      <ErrorState fullScreen title={t("detail.boundaryTitle")} body={t("detail.boundaryBody")} onRetry={reset} retryLabel={tc("actions.retry")} />
    </AppShell>
  );
}
