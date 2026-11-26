/* 404 body for app/not-found.tsx. The way back is a real <Link href="/">
   (crawlable, middle-click / open-in-new-tab work), not a button that calls
   router.push (frontend-architecture §12).
   Must stay a client component: the @devdigest/ui barrel pulls client-only
   modules (class components), and importing it from a Server Component makes
   `next dev` throw "Super expression must either be null or a function" on
   every route (not-found is part of the root tree). */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function NotFoundView() {
  const t = useTranslations("common");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <EmptyState icon="Search" title={t("notFound.title")} body={t("notFound.body")} />
      <Link href="/" style={{ color: "var(--accent-text)", fontSize: 14 }}>
        {t("notFound.cta")}
      </Link>
    </div>
  );
}
