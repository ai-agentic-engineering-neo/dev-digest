/* Route-segment error boundary. Renders inside the root layout, so the intl
   and query providers are available. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import { AppShell } from "../components/app-shell";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AppShell crumb={[{ label: "DevDigest" }]}>
      <ErrorState fullScreen title={t("errorPage.title")} body={t("errorPage.body")} onRetry={reset} />
    </AppShell>
  );
}
