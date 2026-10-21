/* Onboarding tour screen — /repos/:repoId/tour. Server data through the
   onboarding hooks; the five cards, the TOC and the states live here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { TourToc } from "@/components/tour-toc";
import { ApiError } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { featureModelFor } from "@/lib/feature-models";
import { useSettings } from "@/lib/hooks/core";
import { useGenerateOnboarding, useOnboarding } from "@/lib/hooks/onboarding";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { LimitedBanner } from "../LimitedBanner";
import { TourHeader } from "../TourHeader";
import { TourSections } from "../TourSections";
import { SECTIONS, SKELETON_CARDS } from "./constants";
import { viewState } from "./helpers";
import { s } from "./styles";
import { useTourNav } from "./useTourNav";

export function OnboardingTourView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const toast = useToast();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: view, isLoading, isError, error, refetch } = useOnboarding(repoId);
  const { data: settings } = useSettings();
  const generate = useGenerateOnboarding();

  const cloned = activeRepo ? !!activeRepo.clone_path : true;
  const state = viewState({ repoNotFound, isLoading, isError, view, cloned });
  const tour = view?.tour ?? null;
  const running = view?.run?.status === "running" || generate.isPending;
  const model = featureModelFor(settings, "onboarding");
  const modelLabel = model ? `${model.provider}/${model.model}` : null;
  const repoName = activeRepo?.full_name ?? repoId;
  const nav = useTourNav(state === "tour");

  const onGenerate = () => generate.mutate(repoId);
  const onShare = async () => {
    if (await copyText(window.location.href)) toast.success(t("shareCopied"));
  };
  const crumb = [{ label: repoName, mono: true }, { label: t("crumb") }];
  const failed = view?.run?.status === "failed" ? view.run : null;

  if (state === "notFound") {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <PageContainer>
        {state === "loading" ? (
          <div style={s.layout} aria-busy="true">
            <div />
            <div style={s.main}>
              <Skeleton height={36} width="50%" />
              <Skeleton height={16} width="70%" />
              {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
                <Skeleton key={i} height={140} />
              ))}
            </div>
          </div>
        ) : state === "error" ? (
          <ErrorState
            title={t("loadError.title")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        ) : (
          <div style={s.layout}>
            <aside style={s.toc}>
              {state === "tour" ? (
                <TourToc
                  title={t("toc.title")}
                  items={SECTIONS.map((sec) => ({ id: sec.id, label: t(`sections.${sec.kind}.title`) }))}
                  activeId={nav.activeId}
                  onSelect={nav.select}
                />
              ) : null}
            </aside>
            <div style={s.main}>
              <TourHeader
                repoName={repoName}
                tour={tour}
                stale={!!view?.stale}
                modelLabel={modelLabel}
                cloned={cloned}
                running={running}
                onRegenerate={onGenerate}
                onShare={() => void onShare()}
              />
              {failed ? (
                <div style={s.banner} role="alert">
                  {t("runFailed", { error: failed.error ?? t("unknownError") })}
                </div>
              ) : null}
              {tour?.limited ? <LimitedBanner repoId={repoId} /> : null}
              {state === "tour" && tour ? (
                <TourSections
                  tour={tour}
                  repo={activeRepo ? { full_name: activeRepo.full_name, default_branch: activeRepo.default_branch } : undefined}
                />
              ) : state === "generating" ? (
                <EmptyState
                  icon="Workflow"
                  title={t("generate.generating")}
                  body={t("generate.generatingBody", { model: modelLabel ?? "—" })}
                />
              ) : state === "notCloned" ? (
                <EmptyState icon="GitBranch" title={t("notCloned.title")} body={t("notCloned.body")} />
              ) : (
                <EmptyState
                  icon="Workflow"
                  title={t("generate.title")}
                  body={t("generate.body")}
                  cta={modelLabel ? t("generate.ctaModel", { model: modelLabel }) : t("generate.cta")}
                  onCta={onGenerate}
                  ctaLoading={generate.isPending}
                />
              )}
            </div>
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}
