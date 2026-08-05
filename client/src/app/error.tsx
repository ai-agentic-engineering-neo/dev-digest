/* Route-segment error boundary for the whole app.

   Why this file exists: `providers.tsx` toasts every failed query and mutation,
   which made the studio LOOK defended — but a toast only covers rejected
   promises. A throw during render is not a query error, and with no boundary it
   unmounted the entire tree and left a blank page. This catches that. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorView } from "../components/error-view";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // The boundary swallows the throw, so without this the stack never reaches
    // the console and the failure is invisible while developing.
    console.error("[error boundary]", error);
  }, [error]);

  const t = useTranslations("common");

  return (
    <ErrorView
      title={t("errorBoundary.title")}
      body={t("errorBoundary.body")}
      // `digest` is the only handle on a server-side throw (the real message is
      // stripped in production builds), so show whichever we actually have.
      detail={error.message || error.digest || null}
      cta={t("errorBoundary.cta")}
      onCta={reset}
    />
  );
}
