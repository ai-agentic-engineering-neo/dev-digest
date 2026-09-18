"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

/** Route-tree error boundary (Next.js file convention) — catches any uncaught
    render/render-lifecycle error below the root layout and shows a designed
    fallback instead of Next's default unstyled error screen. */
export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  const router = useRouter();

  useEffect(() => {
    // No error-reporting service wired up yet — surface it nowhere else.
    console.error(error);
  }, [error]);

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
      <EmptyState
        icon="AlertTriangle"
        title={t("errorPage.title")}
        body={t("errorPage.body")}
        cta={t("errorPage.retry")}
        onCta={reset}
      />
      <button
        type="button"
        onClick={() => router.push("/")}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          fontSize: 13,
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        {t("errorPage.home")}
      </button>
    </div>
  );
}
