/* 404 body for app/not-found.tsx (client: the CTA navigates). */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function NotFoundView() {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <EmptyState
      icon="Search"
      title={t("notFound.title")}
      body={t("notFound.body")}
      cta={t("notFound.cta")}
      onCta={() => router.push("/")}
    />
  );
}
