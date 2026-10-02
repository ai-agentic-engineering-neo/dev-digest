/* 404 for unmatched URLs and for any notFound() call without a closer
   not-found.tsx. Renders inside the root layout, so next-intl is available.

   Same dependency-light rule as error.tsx: no AppShell, no repo context —
   a 404 must render even when nothing else can. */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export default function NotFound() {
  const t = useTranslations("common.notFound");
  const router = useRouter();

  return (
    <EmptyState
      icon="Search"
      title={t("title")}
      body={t("body")}
      cta={t("cta")}
      onCta={() => router.push("/")}
    />
  );
}
