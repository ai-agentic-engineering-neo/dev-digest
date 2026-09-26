/* /conventions — Conventions Extractor (HW2). Scan the active repo, review the
   candidates (accept / reject / edit inline), and create the repo-conventions
   skill from the accepted ones. Rejected candidates stay hidden and stay
   rejected across re-scans. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useActiveRepo } from "../../../../lib/repo-context";
import { useConventions, useDecideConvention, useDeselectConventions, useExtractConventions } from "../../../../lib/hooks/conventions";
import { relativeTime } from "../../../../lib/relative-time";
import { CandidateCard } from "../CandidateCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { countByStatus, visibleCandidates } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { activeRepo, reposLoaded } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const decide = useDecideConvention();
  const deselect = useDeselectConventions();
  const [showRejected, setShowRejected] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  const scan = data?.scan ?? null;
  const running = scan?.status === "running" || extract.isPending;
  const candidates = data?.candidates ?? [];
  const counts = countByStatus(candidates);
  const visible = visibleCandidates(candidates, showRejected);
  const hasScanned = !!scan;

  const scanButton = (
    <Button
      kind={hasScanned ? "secondary" : "primary"}
      size="sm"
      icon={hasScanned ? "RefreshCw" : "Play"}
      onClick={() => repoId && extract.mutate(repoId)}
      disabled={!repoId || running || !activeRepo?.clone_path}
    >
      {running ? t("page.scanning") : hasScanned ? t("page.rescan") : t("page.runScan")}
    </Button>
  );

  return (
    <AppShell crumb={crumb}>
      {creating && repoId && activeRepo && (
        <CreateSkillModal repoId={repoId} repoName={activeRepo.name} onClose={() => setCreating(false)} />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repoName}>
                {activeRepo?.name ?? t("page.repoFallback")}
              </span>
            </h1>
            {scan?.status === "failed" && scan.error ? (
              <p style={s.metaError}>{t("page.metaFailed", { error: scan.error })}</p>
            ) : scan?.status === "running" ? (
              <p style={s.meta}>{t("page.metaRunning", { count: scan.sample_count })}</p>
            ) : scan ? (
              <p style={s.meta}>{t("page.meta", { count: scan.sample_count, when: relativeTime(scan.finished_at ?? scan.started_at) })}</p>
            ) : (
              <p style={s.meta}>{t("page.subtitle")}</p>
            )}
          </div>
          {scanButton}
        </div>

        {!reposLoaded && <Skeleton height={120} />}
        {reposLoaded && !activeRepo && <EmptyState icon="Folder" title={t("page.noRepo.title")} body={t("page.noRepo.body")} />}
        {activeRepo && !activeRepo.clone_path && (
          <EmptyState icon="GitBranch" title={t("page.notCloned.title")} body={t("page.notCloned.body")} />
        )}
        {activeRepo?.clone_path && isLoading && (
          <div style={s.list}>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        )}
        {activeRepo?.clone_path && isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {activeRepo?.clone_path && data && candidates.length === 0 && !running && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => repoId && extract.mutate(repoId)}
          />
        )}
        {activeRepo?.clone_path && data && candidates.length > 0 && (
          <>
            <div style={s.toolbar}>
              <Button kind="secondary" size="sm" icon="X" onClick={() => repoId && deselect.mutate(repoId)} disabled={counts.accepted === 0 || deselect.isPending}>
                {t("page.deselectAll")}
              </Button>
              <span style={s.count}>{t("page.acceptedCount", { accepted: counts.accepted, total: counts.total })}</span>
              {counts.rejected > 0 && (
                <button type="button" style={s.rejectedToggle} onClick={() => setShowRejected((v) => !v)}>
                  {showRejected ? t("page.hideRejected") : t("page.showRejected", { count: counts.rejected })}
                </button>
              )}
              <span style={s.spacer} />
              {counts.accepted > 0 && (
                <Button kind="primary" size="sm" icon="Sparkles" onClick={() => setCreating(true)}>
                  {t("page.createSkill")}
                </Button>
              )}
            </div>
            {visible.length === 0 ? (
              <EmptyState icon="ListChecks" title={t("page.allRejected.title")} body={t("page.allRejected.body")} />
            ) : (
              <div style={s.list}>
                {visible.map((c) => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    pending={decide.isPending}
                    onChange={(patch) => repoId && decide.mutate({ repoId, id: c.id, patch })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
