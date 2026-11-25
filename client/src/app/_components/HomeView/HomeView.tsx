/* Root — sends the user to the first repo's PR list, or onboarding if no repos. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRepos } from "@/lib/hooks/core";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell";
import { EmptyState, Skeleton } from "@devdigest/ui";

/* Navigation is a real <Link href> (open-in-new-tab, crawlable), not a button
   calling router.push (frontend-architecture §12). */
const linkStyle = { color: "var(--accent-text)", fontSize: 14 } as const;

export function HomeView() {
  const t = useTranslations("home");
  const router = useRouter();
  const { data: repos, isLoading, isError } = useRepos();

  React.useEffect(() => {
    if (repos && repos.length > 0) {
      router.replace(`/repos/${repos[0]!.id}/pulls`);
    }
  }, [repos, router]);

  return (
    <AppShell crumb={[{ label: "DevDigest" }]}>
      <PageContainer title={t("title")} subtitle={t("subtitle")}>
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <Skeleton height={20} width={240} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : isError || !repos || repos.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <EmptyState icon="GitBranch" title={t("empty.title")} body={t("empty.body")} />
            <Link href="/onboarding" style={linkStyle}>
              {t("empty.cta")}
            </Link>
          </div>
        ) : (
          <div>
            <p style={{ color: "var(--text-secondary)", marginBottom: 14 }}>{t("redirecting")}</p>
            <Link href={`/repos/${repos[0]!.id}/pulls`} style={linkStyle}>
              {t("openRepo", { name: repos[0]!.full_name })}
            </Link>
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}
