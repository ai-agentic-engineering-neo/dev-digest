/* 404 for unknown URLs (and anything that calls notFound()). */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export default function NotFound() {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <EmptyState
        icon="Search"
        title={t("notFoundPage.title")}
        body={t("notFoundPage.body")}
        cta={t("notFoundPage.cta")}
        onCta={() => router.push("/")}
      />
    </div>
  );
}
