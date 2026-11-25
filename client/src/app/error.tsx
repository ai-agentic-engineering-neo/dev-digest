/* Root error boundary (Next.js `error.tsx`): catches render errors in any route
   below the root layout, so one broken view no longer blanks the whole app.
   Deliberately no <AppShell>: the shell's own data hooks may be what failed. */
"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  return <ErrorState fullScreen title={t("errorPage.title")} body={t("errorPage.body")} onRetry={reset} />;
}
