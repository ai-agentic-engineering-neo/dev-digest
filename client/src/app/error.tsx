/* Last-resort boundary: a render error anywhere below the root layout lands here
   instead of a blank page. Errors in event handlers and async code do not reach
   it (mutations/queries have their own toast path). */
"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  return <ErrorState fullScreen title={t("errorBoundary.title")} body={t("errorBoundary.body")} onRetry={reset} />;
}
