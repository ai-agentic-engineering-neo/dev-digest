/* ConventionsView — /repos/:repoId/conventions: run / re-run the extractor,
   review the evidence-backed rules (filter, accept / reject, inline edit), see
   what the evidence check dropped, and merge the accepted rules into a skill.
   The state query polls while a scan runs (useConventions). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ConventionStatus } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useConventions, useExtractConventions, useRepos, useSkills, useUpdateConvention } from "@/lib/hooks";
import { useRepoNotFound } from "@/lib/repo-context";
import { STATUS_FILTERS, type StatusFilter } from "../../constants";
import { countByStatus, filterByStatus, relativeAge } from "../../helpers";
import { ConventionCard, type ConventionEdit } from "../ConventionCard";
import { CreateConventionSkillModal } from "../CreateConventionSkillModal";
import { DroppedCandidates } from "../DroppedCandidates";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const tc = useTranslations("common");
  const repoNotFound = useRepoNotFound(repoId);
  const { data: repos } = useRepos();
  const { data: state, isLoading, isError, refetch } = useConventions(repoId);
  const { data: skills } = useSkills();
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [modalOpen, setModalOpen] = React.useState(false);

  const repoName = repos?.find((r) => r.id === repoId)?.name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  const scan = state?.scan ?? null;
  const conventions = state?.conventions ?? [];
  const running = scan?.status === "running" || extract.isPending;
  /** A scan has already run for this repo → the re-run control takes over. */
  const hasScan = Boolean(scan) || conventions.length > 0;
  const counts = countByStatus(conventions);
  const visible = filterByStatus(conventions, filter);
  const accepted = conventions.filter((c) => c.status === "accepted");
  const skillNames = new Map(skills?.map((sk) => [sk.id, sk.name]));

  const decide = (id: string, status: ConventionStatus) => update.mutate({ id, patch: { status } });
  const edit = (id: string, patch: ConventionEdit) => update.mutate({ id, patch });
  const setAll = (from: ConventionStatus, to: ConventionStatus) => {
    for (const c of conventions) if (c.status === from) decide(c.id, to);
  };

  const age = (iso: string) => {
    const a = relativeAge(iso);
    return a.unit === "justNow" ? t("time.justNow") : t(`time.${a.unit}`, { count: a.count });
  };
  const subtitle = !scan
    ? t("page.subtitle")
    : scan.status === "running"
      ? t("page.scanningSummary", { count: scan.sampled_files.length })
      : t("page.scanSummary", { count: scan.sampled_files.length, when: age(scan.finished_at ?? scan.started_at) });

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repoName}>
                {repoName}
              </span>
            </h1>
            <p style={s.subtitle}>{subtitle}</p>
          </div>
          {state && (
            <div style={s.scanButtons}>
              {/* Two separate controls: the first run and the re-run (spec 04, AC 45). */}
              <Button
                icon="Play"
                title={t("page.runScanHint")}
                loading={running && !hasScan}
                disabled={running || hasScan}
                onClick={() => extract.mutate()}
              >
                {running && !hasScan ? t("page.scanning") : t("page.runScan")}
              </Button>
              <Button
                icon="RefreshCw"
                title={t("page.rescanHint")}
                loading={running && hasScan}
                disabled={running || !hasScan}
                onClick={() => extract.mutate()}
              >
                {running && hasScan ? t("page.scanning") : t("page.rescan")}
              </Button>
            </div>
          )}
        </div>

        {scan?.status === "failed" && (
          <div role="alert" style={s.failed}>
            <Icon.AlertTriangle size={14} style={s.failedIcon} />
            <span>
              <b>{t("page.extractionFailed")}</b>
              {scan.error ? ` — ${scan.error}` : null}
            </span>
          </div>
        )}

        {isLoading && (
          <div style={s.list}>
            <Skeleton height={180} />
            <Skeleton height={180} />
          </div>
        )}
        {isError && (
          <ErrorState title={tc("states.error")} body={t("page.loadError")} onRetry={() => refetch()} retryLabel={tc("actions.retry")} />
        )}

        {/* No CTA on the empty state: the header owns Run Scan / ReScan, so the
            page never shows two buttons that start the same scan. */}
        {state && !scan && conventions.length === 0 && (
          <EmptyState icon="ListChecks" title={t("page.empty.title")} body={t("page.empty.body")} />
        )}

        {conventions.length > 0 && (
          <>
            <div style={s.toolbar}>
              {STATUS_FILTERS.map((f) => (
                <Chip key={f} active={filter === f} count={counts[f]} onClick={() => setFilter(f)}>
                  {t(`toolbar.${f}`)}
                </Chip>
              ))}
              <span className="tnum" style={s.count}>
                {t("toolbar.acceptedCount", { accepted: counts.accepted, total: counts.all })}
              </span>
              <div style={s.toolbarRight}>
                {counts.pending > 0 && (
                  <Button kind="ghost" size="sm" icon="Check" onClick={() => setAll("pending", "accepted")}>
                    {t("toolbar.acceptAllPending")}
                  </Button>
                )}
                {counts.accepted > 0 && (
                  <Button kind="ghost" size="sm" icon="X" onClick={() => setAll("accepted", "pending")}>
                    {t("toolbar.deselectAll")}
                  </Button>
                )}
                {/* Appears only once at least one candidate is accepted (AC 50). */}
                {accepted.length > 0 && (
                  <Button kind="primary" icon="Sparkles" onClick={() => setModalOpen(true)}>
                    {t("toolbar.createSkill")}
                  </Button>
                )}
              </div>
            </div>
            {visible.length === 0 ? (
              <p style={s.muted}>{t("page.noMatch")}</p>
            ) : (
              <div style={s.list}>
                {visible.map((c) => (
                  <ConventionCard
                    key={c.id}
                    convention={c}
                    skillName={c.skill_id ? skillNames.get(c.skill_id) : undefined}
                    onDecide={(status) => decide(c.id, status)}
                    onEdit={(patch) => edit(c.id, patch)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {scan?.status === "done" && conventions.length === 0 && <p style={s.muted}>{t("page.noneKept")}</p>}
        {scan && scan.status !== "running" && <DroppedCandidates dropped={scan.dropped} />}
      </div>

      {modalOpen && (
        <CreateConventionSkillModal
          repoId={repoId}
          repoName={repoName}
          conventions={accepted}
          onClose={() => setModalOpen(false)}
        />
      )}
    </AppShell>
  );
}
