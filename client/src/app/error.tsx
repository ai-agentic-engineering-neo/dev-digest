/* Route-level error boundary: catches render errors in any page below the root
   layout, so one failing view no longer blanks the whole app (Next.js error.tsx). */
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      fullScreen
      title={t("errorPage.title")}
      body={
        <>
          {t("errorPage.body")} <Link href="/">{t("errorPage.home")}</Link>
        </>
      }
      onRetry={reset}
    />
  );
}
