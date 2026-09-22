/* HomeView — root screen: sends the user to the first repo's PR list, or offers
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

const pullsHref = (repoId: string) => `/repos/${repoId}/pulls`;

export function HomeView() {
  const t = useTranslations("home");
  const router = useRouter();
  const { data: repos, isLoading, isError } = useRepos();
  const first = repos?.[0];

  React.useEffect(() => {
    if (first) router.replace(pullsHref(first.id));
  }, [first, router]);

  return (
    <AppShell crumb={[{ label: t("breadcrumb") }]}>
      <PageContainer title={t("title")} subtitle={t("subtitle")}>
        {isLoading ? (
          <div style={s.skeletons}>
            <Skeleton height={20} width={240} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : isError || !first ? (
          <EmptyState
            icon="GitBranch"
            title={t("empty.title")}
            body={t("empty.body")}
            cta={t("empty.cta")}
            onCta={() => router.push("/onboarding")}
          />
        ) : (
          <div>
            <p style={s.redirecting}>{t("redirecting")}</p>
            <Button kind="primary" onClick={() => router.push(pullsHref(first.id))}>
              {t("openRepo", { name: first.full_name })}
            </Button>
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}
