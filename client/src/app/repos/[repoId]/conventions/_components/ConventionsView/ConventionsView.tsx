/* ConventionsView — "Conventions in <repo>": run a scan, review candidates,
   and open the Create-skill modal with the accepted ones. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionStatus } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useConventions, useExtractConventions, useSetConventionStatus } from "@/lib/hooks/conventions";
import { useRefreshRepo } from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { acceptedOf, bulkAction } from "./helpers";
import { CLONE_POLL_MS, CLONE_TIMEOUT_MS, SKELETON_CARDS } from "./constants";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions.page");
  const format = useFormatter();
  const toast = useToast();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const setStatus = useSetConventionStatus(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const refresh = useRefreshRepo();
  const [cloningSince, setCloningSince] = React.useState<number | null>(null);

  const repoName = activeRepo?.name ?? repoId;
  // Extraction reads the local clone — say so up front instead of failing on click.
  const notCloned = activeRepo != null && !activeRepo.clone_path;

  // The clone is a background job: poll the repos list until `clone_path` appears.
  React.useEffect(() => {
    if (cloningSince == null) return;
    if (!notCloned) {
      setCloningSince(null);
      return;
    }
    const timer = setInterval(() => {
      if (Date.now() - cloningSince > CLONE_TIMEOUT_MS) {
        setCloningSince(null);
        toast.error(t("notCloned.timedOut", { repo: activeRepo?.full_name ?? repoName }));
        return;
      }
      void qc.invalidateQueries({ queryKey: ["repos"] });
    }, CLONE_POLL_MS);
    return () => clearInterval(timer);
  }, [cloningSince, notCloned, qc, toast, t, activeRepo?.full_name, repoName]);

  const cloneRepo = () =>
    refresh.mutate(repoId, {
      onSuccess: () => {
        toast.info(t("notCloned.started", { repo: activeRepo?.full_name ?? repoName }));
        setCloningSince(Date.now());
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : t("extractionFailed")),
    });
  const crumb = [{ label: t("crumbLab") }, { label: t("crumbConventions") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const scan = data?.scan ?? null;
  const candidates = data?.candidates ?? [];
  const accepted = acceptedOf(candidates);
  const bulk = bulkAction(candidates);

  const runExtraction = () =>
    extract.mutate(undefined, {
      onError: (err) => toast.error(err instanceof ApiError ? err.message : t("extractionFailed")),
    });

  const changeStatus = (id: string, status: ConventionStatus) =>
    setStatus.mutate(
      { id, status },
      { onError: (err) => toast.error(err instanceof ApiError ? err.message : t("statusFailed")) },
    );

  const runBulk = () => {
    if (bulk === "deselectAll") accepted.forEach((c) => changeStatus(c.id, "pending"));
    else if (bulk === "acceptAll")
      candidates.filter((c) => c.status === "pending").forEach((c) => changeStatus(c.id, "accepted"));
  };

  const body = (() => {
    if (isLoading) {
      return (
        <div style={s.loading}>
          {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
            <Skeleton key={i} height={150} />
          ))}
        </div>
      );
    }
    if (isError) {
      return (
        <ErrorState
          title={t("loadError")}
          body={error instanceof ApiError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      );
    }
    if (notCloned && !scan) {
      const cloning = cloningSince != null || refresh.isPending;
      return (
        <div style={s.notCloned}>
          <EmptyState
            icon="GitPullRequest"
            title={t("notCloned.title")}
            body={t("notCloned.body", { repo: activeRepo?.full_name ?? repoName })}
            cta={cloning ? t("notCloned.cloning") : t("notCloned.cta")}
            onCta={cloning ? undefined : cloneRepo}
            ctaLoading={cloning}
          />
          <Button kind="ghost" icon="Plus" onClick={() => router.push("/onboarding")}>
            {t("notCloned.addRepo")}
          </Button>
        </div>
      );
    }
    if (!scan) {
      return (
        <EmptyState
          icon="ListChecks"
          title={t("empty.title")}
          body={t("empty.body")}
          cta={extract.isPending ? t("scanning") : t("empty.cta")}
          onCta={runExtraction}
          ctaLoading={extract.isPending}
        />
      );
    }
    if (candidates.length === 0) {
      return <EmptyState icon="ListChecks" title={t("noCandidates.title")} body={t("noCandidates.body")} />;
    }
    return (
      <>
        <div style={s.toolbar}>
          {bulk && (
            <Button size="sm" icon={bulk === "deselectAll" ? "X" : "Check"} onClick={runBulk}>
              {t(bulk)}
            </Button>
          )}
          <span style={s.count}>{t("acceptedCount", { accepted: accepted.length, total: candidates.length })}</span>
          <span style={s.toolbarRight}>
            <Button kind="primary" icon="Sparkles" disabled={accepted.length === 0} onClick={() => setModalOpen(true)}>
              {t("createSkill")}
            </Button>
          </span>
        </div>
        <div style={s.list}>
          {candidates.map((c) => (
            <ConventionCard
              key={c.id}
              candidate={c}
              repoFullName={activeRepo?.full_name ?? null}
              sourceSha={scan.source_sha}
              onStatus={(status) => changeStatus(c.id, status)}
            />
          ))}
        </div>
      </>
    );
  })();

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>
              {t("headingPrefix")}
              <span className="mono" style={s.titleRepo}>
                {repoName}
              </span>
            </h1>
            <p style={s.subtitle}>
              {scan
                ? t("subtitleScanned", {
                    count: scan.sample_file_count,
                    when: format.relativeTime(new Date(scan.created_at)),
                  })
                : t("subtitleNone")}
            </p>
          </div>
          {scan && (
            <div style={s.headerActions}>
              <Button icon="RefreshCw" loading={extract.isPending} onClick={runExtraction}>
                {extract.isPending ? t("scanning") : t("rescan")}
              </Button>
            </div>
          )}
        </div>
        {body}
      </div>
      {modalOpen && (
        <CreateSkillModal
          repoId={repoId}
          repoName={repoName}
          accepted={accepted}
          onClose={() => setModalOpen(false)}
        />
      )}
    </AppShell>
  );
}
