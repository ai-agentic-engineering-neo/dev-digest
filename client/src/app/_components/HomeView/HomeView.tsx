/* Home view — sends the user to the first repo's PR list, or offers
   onboarding when there are no repos yet. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, Button, Skeleton } from "@devdigest/ui";
import { useRepos } from "@/lib/hooks";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell";
import { s } from "./styles";

export function HomeView() {
  const t = useTranslations("common.home");
  const router = useRouter();
  const { data: repos, isLoading, isError } = useRepos();
  const first = repos?.[0];

  // Navigation to an external-to-render target is a side effect → effect.
  React.useEffect(() => {
    if (first) router.replace(`/repos/${first.id}/pulls`);
  }, [first, router]);

  return (
    <AppShell crumb={[{ label: t("crumb") }]}>
      <PageContainer title={t("title")} subtitle={t("subtitle")}>
        {isLoading ? (
          <div style={s.loading}>
            <Skeleton height={20} width={240} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : isError || !first ? (
          <EmptyState
            icon="GitBranch"
            title={t("emptyTitle")}
            body={t("emptyBody")}
            cta={t("emptyCta")}
            onCta={() => router.push("/onboarding")}
          />
        ) : (
          <div>
            <p style={s.redirecting}>{t("redirecting")}</p>
            <Button kind="primary" onClick={() => router.push(`/repos/${first.id}/pulls`)}>
              {t("openRepo", { name: first.full_name })}
            </Button>
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}
