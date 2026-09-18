"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

/** Route-tree not-found boundary (Next.js file convention) — shown for an
    unmatched route or an explicit notFound() call anywhere below the root layout.
    Client component (matching error.tsx and RepoNotFound): @devdigest/ui's
    barrel also exports the Recharts-backed chart components, which aren't
    "use client" themselves and break when their module graph is evaluated on
    the server — every other EmptyState usage in this codebase is reached only
    from within a client boundary for the same reason. */
export default function NotFound() {
  const t = useTranslations("common");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minHeight: "100dvh",
        justifyContent: "center",
        gap: 4,
      }}
    >
      <EmptyState icon="FileText" title={t("notFoundPage.title")} body={t("notFoundPage.body")} />
      <Link href="/" style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "underline" }}>
        {t("notFoundPage.cta")}
      </Link>
    </div>
  );
}
