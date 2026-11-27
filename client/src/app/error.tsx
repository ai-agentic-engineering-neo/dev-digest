/* Route-level error boundary (Next.js App Router). Catches render/runtime
   errors in any page below the root layout and offers a retry, instead of
   each page hand-rolling a try/catch. Data-fetch errors are still handled
   inline by the views (ErrorState with the API message). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.errorBoundary");

  React.useEffect(() => {
    // Surface in the browser console for debugging; the UI stays generic.
    console.error(error);
  }, [error]);

  return <ErrorState fullScreen title={t("title")} body={t("body")} onRetry={reset} />;
}
