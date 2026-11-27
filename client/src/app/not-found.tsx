/* Unknown URL (or notFound() from a page) → friendly empty state with a way home.
   A client component on purpose: the @devdigest/ui barrel pulls in client-only
   modules (recharts class components) that crash when evaluated as RSC. */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export default function NotFound() {
  const t = useTranslations("common.notFound");
  return (
    <div style={{ padding: "64px 32px" }}>
      <EmptyState icon="Search" title={t("title")} body={t("body")} />
      <p style={{ textAlign: "center", marginTop: 16 }}>
        <Link href="/">{t("cta")}</Link>
      </p>
    </div>
  );
}
