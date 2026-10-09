/* OnboardingTourView — /repos/:repoId/tour (specs/10-onboarding-generator.md).
   Renders the stored tour (or the deterministic skeleton) plus its status and
   provenance; "Generate"/"Regenerate" is the one action that spends anything
   (N7 — nothing regenerates implicitly). Follows repos/[repoId]/context's
   repo-scoped route pattern (useParams + useActiveRepo + useRepoNotFound),
   not pulls/page.tsx (client/LEARNINGS.md: that file is the deviation). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { StatusBanner } from "./StatusBanner";
import { ProvenanceLine } from "./ProvenanceLine";
import { TourToc } from "./TourToc";
import { SectionCard } from "./SectionCard";
import { SkeletonFacts } from "./SkeletonFacts";
import { s } from "./styles";

export function OnboardingTourView() {
  const t = useTranslations("onboarding");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const toast = useToast();

  const { data, isLoading, isError, error, refetch } = useOnboardingTour(repoId);
  const generate = useGenerateOnboardingTour(repoId);

  const repoName = activeRepo?.full_name ?? repoId ?? t("page.repoFallback");
  const crumb = [{ label: repoName, mono: true }, { label: t("page.crumb") }];

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const generating = generate.isPending || data?.status === "generating";
  const hasTour = !!data?.tour;

  function onGenerate() {
    generate.mutate(undefined, {
      onError: (e) => {
        toast.error(e instanceof ApiError ? e.message : t("unknownError"));
      },
    });
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>{t("title")}</h1>
          <p style={s.pageSubtitle}>{t("generate.body")}</p>
        </div>
        {data && data.status !== "empty" && (
          <div style={s.headerActions}>
            <Button
              kind="primary"
              size="sm"
              icon="RefreshCw"
              loading={generating}
              disabled={generating}
              onClick={onGenerate}
            >
              {generating
                ? hasTour
                  ? t("regenerating")
                  : t("generate.generating")
                : hasTour
                  ? t("regenerate")
                  : t("generate.cta")}
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div style={s.loadingStack}>
          <Skeleton height={40} />
          <Skeleton height={200} />
          <Skeleton height={200} />
        </div>
      ) : isError ? (
        <ErrorState
          title={t("loadError.title")}
          body={error instanceof ApiError ? error.message : t("loadError.title")}
          onRetry={() => refetch()}
        />
      ) : !data ? null : (
        <div style={s.body}>
          <StatusBanner status={data.status} reason={data.reason} />
          <ProvenanceLine provenance={data.provenance} />

          {data.status === "empty" ? (
            <EmptyState icon="Folder" title={t("status.empty")} body={data.reason ?? t("empty.body")} />
          ) : hasTour && data.tour ? (
            <>
              <TourToc sections={data.tour.sections} />
              {data.tour.sections.map((section) => (
                <SectionCard
                  key={section.kind}
                  section={section}
                  repoFullName={activeRepo?.full_name}
                  indexSha={data.provenance.index_sha}
                />
              ))}
            </>
          ) : (
            <SkeletonFacts facts={data.facts} />
          )}
        </div>
      )}
    </AppShell>
  );
}

export default OnboardingTourView;
