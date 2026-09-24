"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

/* Root error boundary — any route segment that throws while rendering lands
   here (inside the root layout, so intl + providers are still mounted). */
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  return (
    <ErrorState
      fullScreen
      title={t("errorPage.title")}
      body={t("errorPage.body")}
      onRetry={reset}
      retryLabel={t("actions.retry")}
    />
  );
}
