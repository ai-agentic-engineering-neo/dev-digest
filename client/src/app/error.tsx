/* Route-level error boundary. Catches render errors in any page below the root
   layout (providers + i18n are still mounted here). Deliberately does NOT
   re-render AppShell: if the crash came from the shell, that would loop. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  React.useEffect(() => {
    // Keep the original error visible in devtools / any log collector.
    console.error(error);
  }, [error]);

  return (
    <div role="alert" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <EmptyState
        icon="AlertTriangle"
        title={t("errorPage.title")}
        body={t("errorPage.body")}
        cta={t("errorPage.cta")}
        onCta={reset}
      />
    </div>
  );
}
