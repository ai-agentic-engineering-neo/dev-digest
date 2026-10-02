/* Route-level error boundary for the whole app tree.
   Catches render errors in any segment that has no closer error.tsx.

   Deliberately dependency-light: no AppShell, no repo context, no data hooks.
   A boundary that leans on the machinery which may have just thrown will throw
   again and escalate to global-error. ErrorState + useTranslations only —
   next-intl's provider lives in the root layout, which is still mounted here. */
"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.routeError");

  useEffect(() => {
    // Surface it — Next.js swallows the original stack in production builds.
    console.error("[route error]", error);
  }, [error]);

  return (
    <ErrorState
      fullScreen
      title={t("title")}
      body={t("body")}
      onRetry={reset}
    />
  );
}
