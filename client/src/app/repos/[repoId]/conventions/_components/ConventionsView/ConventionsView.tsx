/* ConventionsView — /repos/:repoId/conventions. Runs a scan, lists what it
   proposed, and turns the accepted rules into a skill.

   The page has four shapes and they are genuinely different: never scanned,
   scanning, failed, and done. Collapsing them into one list with a spinner
   would hide the only interesting failure — a repo that has no index to sample
   from, which needs a re-sync, not a retry. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import {
  useConventions,
  useRunConventionScan,
  useUpdateCandidate,
} from "@/lib/hooks/conventions";
import { ApiError } from "@/lib/api";
import { SCANNING_SKELETON_CARDS } from "../../constants";
import { bucketCandidates, discardedTotal, isScanning, scanAge } from "../../helpers";
import { CandidateCard } from "../CandidateCard";
import { CreateConventionsSkillModal } from "../CreateConventionsSkillModal";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const router = useRouter();
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const runScan = useRunConventionScan(repoId);
  const updateCandidate = useUpdateCandidate(repoId);

  const [showRejected, setShowRejected] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const scan = data?.scan ?? null;
  const scanning = isScanning(scan);
  const buckets = bucketCandidates(data?.candidates ?? []);
  const acceptedIds = buckets.accepted.map((c) => c.id);
  const visible = [
    ...buckets.pending,
    ...buckets.accepted,
    ...(showRejected ? buckets.rejected : []),
  ];

  const startScan = async () => {
    setScanError(null);
    try {
      await runScan.mutateAsync();
    } catch (err) {
      setScanError(err instanceof ApiError ? err.message : t("page.extractionFailed"));
    }
  };

  const setStatus = (candidate: ConventionCandidate, status: ConventionCandidate["status"]) =>
    updateCandidate.mutate({ id: candidate.id, patch: { status } });

  const editCandidate = (
    candidate: ConventionCandidate,
    patch: { rule: string; category: ConventionCategory },
  ) => updateCandidate.mutate({ id: candidate.id, patch });

  const age = scanAge(scan);

  return (
    <AppShell crumb={crumb}>
      {creating && (
        <CreateConventionsSkillModal
          repoId={repoId}
          repoFullName={activeRepo?.full_name}
          candidateIds={acceptedIds}
          onClose={() => setCreating(false)}
          onCreated={(skill) => router.push(`/skills/${skill.id}`)}
        />
      )}

      <div style={s.page}>
        <header style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.title}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repo}>
                {activeRepo?.full_name ?? t("page.repoFallback")}
              </span>
            </h1>
            <p style={s.subtitle}>
              {scanning
                ? t("page.scanning")
                : scan
                  ? [
                      t("page.detectedFrom", { count: scan.sample_files.length }),
                      age ? t(`page.age.${age.unit}`, { count: age.value }) : null,
                      discardedTotal(scan.discarded) > 0
                        ? t("page.discarded", { count: discardedTotal(scan.discarded) })
                        : null,
                      t("page.usingModel", { model: scan.model }),
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : t("page.subtitle")}
            </p>
          </div>

          {/* Two buttons on purpose: the first run and a re-run are different
              decisions, and only one of them can discard nothing. */}
          {scan && (
            <Button
              kind="secondary"
              icon="RefreshCw"
              onClick={startScan}
              disabled={scanning || runScan.isPending}
              loading={scanning || runScan.isPending}
            >
              {t("page.rescan")}
            </Button>
          )}
        </header>

        {scanError && (
          <div role="alert" style={s.alert}>
            {scanError}
          </div>
        )}

        {scan?.status === "failed" && (
          <div role="alert" style={s.alert}>
            <Icon.AlertTriangle size={15} />
            <span style={s.alertText}>{scan.error ?? t("page.extractionFailed")}</span>
            {scan.error?.includes("repo_not_indexed") && (
              <Button kind="ghost" size="sm" onClick={() => router.push(`/repos/${repoId}/pulls`)}>
                {t("page.goToRepo")}
              </Button>
            )}
          </div>
        )}

        {isError && !isLoading && (
          <ErrorState title={t("page.loadError")} onRetry={() => refetch()} />
        )}

        {isLoading ? (
          <div style={s.list}>
            {Array.from({ length: SCANNING_SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={150} />
            ))}
          </div>
        ) : scanning ? (
          <div style={s.list}>
            {Array.from({ length: SCANNING_SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={150} />
            ))}
          </div>
        ) : (data?.candidates.length ?? 0) === 0 ? (
          // Only when there is truly nothing: a repo whose every candidate was
          // rejected still has candidates, and needs the toolbar to get them back.
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={runScan.isPending ? t("page.scanning") : t("page.runScan")}
            onCta={startScan}
          />
        ) : (
          <>
            <div style={s.toolbar}>
              <Button
                kind="ghost"
                size="sm"
                icon="X"
                disabled={acceptedIds.length === 0}
                onClick={() =>
                  buckets.accepted.forEach((c) => setStatus(c, "pending"))
                }
              >
                {t("page.deselectAll")}
              </Button>
              <span style={s.count}>
                {t("page.acceptedCount", {
                  accepted: acceptedIds.length,
                  total: buckets.pending.length + buckets.accepted.length,
                })}
              </span>

              {buckets.rejected.length > 0 && (
                <Button
                  kind="ghost"
                  size="sm"
                  icon={showRejected ? "EyeOff" : "Eye"}
                  onClick={() => setShowRejected((v) => !v)}
                >
                  {showRejected
                    ? t("page.hideRejected", { count: buckets.rejected.length })
                    : t("page.showRejected", { count: buckets.rejected.length })}
                </Button>
              )}

              {/* Appears only once something has been accepted: the button is
                  the answer to "what do I do with these?", and it would be a
                  dead control before the first Accept. */}
              {acceptedIds.length > 0 && (
                <Button kind="primary" icon="Sparkles" onClick={() => setCreating(true)}>
                  {t("page.createSkill")}
                </Button>
              )}
            </div>

            {visible.length === 0 && (
              <p style={s.subtitle}>{t("page.allRejected")}</p>
            )}

            <div style={s.list}>
              {visible.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  repoFullName={activeRepo?.full_name}
                  busy={updateCandidate.isPending}
                  onStatus={(status) => setStatus(candidate, status)}
                  onEdit={(patch) => editCandidate(candidate, patch)}
                  onOpenSkill={(skillId) => router.push(`/skills/${skillId}`)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
