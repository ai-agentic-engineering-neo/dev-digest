/* Unmatched URL (and notFound() calls). Renders inside the root layout. */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "../components/app-shell";

export default function NotFound() {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <AppShell crumb={[{ label: "DevDigest" }]}>
      <EmptyState
        icon="Search"
        title={t("notFound.title")}
        body={t("notFound.body")}
        cta={t("notFound.cta")}
        onCta={() => router.push("/")}
      />
    </AppShell>
  );
}
