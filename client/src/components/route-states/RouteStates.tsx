/* Full-page fallbacks used by the Next.js special files (`app/error.tsx`,
   `app/not-found.tsx`, `app/global-error.tsx`). Kept here so the route files
   stay thin and the UI is testable without the Next runtime. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState } from "@devdigest/ui";
import { s } from "./styles";

/** Render error inside a route: retry re-renders the segment, home is a hard reload. */
export function RouteError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const t = useTranslations("common");

  React.useEffect(() => {
    // Keep the original error visible in the console for debugging.
    console.error(error);
  }, [error]);

  return (
    <div style={s.page}>
      <ErrorState fullScreen title={t("errorPage.title")} body={t("errorPage.body")} onRetry={onRetry} />
      <div style={s.actions}>
        <Button kind="ghost" onClick={() => window.location.assign("/")}>
          {t("errorPage.home")}
        </Button>
      </div>
    </div>
  );
}

/** Unknown URL. */
export function RouteNotFound() {
  const t = useTranslations("common");
  return (
    <div style={s.page}>
      <EmptyState
        icon="Search"
        title={t("notFound.title")}
        body={t("notFound.body")}
        cta={t("notFound.cta")}
        onCta={() => window.location.assign("/")}
      />
    </div>
  );
}
