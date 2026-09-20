/* Root — sends the user to the first repo's PR list, or onboarding if no repos. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRepos } from "@/lib/api/repos";
import { ShellCrumb } from "@/components/app-shell";
import { PageContainer } from "./_components/PageShell";
import { EmptyState, Button, Skeleton } from "@devdigest/ui";

export default function HomePage() {
  const router = useRouter();
  const t = useTranslations("shell");
  const { data: repos, isLoading, isError } = useRepos();

  React.useEffect(() => {
    if (repos && repos.length > 0) {
      router.replace(`/repos/${repos[0]!.id}/pulls`);
    }
  }, [repos, router]);

  return (
    <>
      <ShellCrumb items={[{ label: "DevDigest" }]} />
      <PageContainer title={t("page.title")} subtitle={t("page.subtitle")}>
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <Skeleton height={20} width={240} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : isError || !repos || repos.length === 0 ? (
          <EmptyState
            icon="GitBranch"
            title={t("page.emptyTitle")}
            body={t("page.emptyBody")}
            cta={t("page.emptyCta")}
            onCta={() => router.push("/onboarding")}
          />
        ) : (
          <div>
            <p style={{ color: "var(--text-secondary)", marginBottom: 14 }}>{t("page.redirecting")}</p>
            <Button kind="primary" onClick={() => router.push(`/repos/${repos[0]!.id}/pulls`)}>
              {t("page.open", { name: repos[0]!.full_name })}
            </Button>
          </div>
        )}
      </PageContainer>
    </>
  );
}
