/* NotFoundView — 404 screen inside the app shell, with a way back home. */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";

export function NotFoundView() {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <AppShell crumb={[{ label: t("notFound.title") }]}>
      <EmptyState
        icon="Search"
        title={t("notFound.title")}
        body={t("notFound.body")}
        cta={t("actions.goHome")}
        onCta={() => router.push("/")}
      />
    </AppShell>
  );
}
