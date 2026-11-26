/* /repos/:repoId/conventions — Conventions Extractor. Re-scan surfaces house
   rules with verified evidence; the user accepts / rejects / edits them, selects
   accepted ones and creates a skill from them (Create skill → modal → the new
   skill's Config tab). Header stays after any scan; the empty state shows only
   before the first scan, and a scan that keeps nothing shows a banner. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, Chip, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import {
  useConventions,
  useScanConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { SKELETON_KEYS, STATUS_FILTERS, type StatusFilter } from "../../constants";
import {
  countByStatus,
  defaultSelection,
  filterByStatus,
  newestScan,
  selectedAccepted,
  statusOf,
  toggleId,
} from "../../helpers";
import { ConventionCard } from "../ConventionCard";
import { EditConventionModal } from "../EditConventionModal";
import { CreateSkillFromConventionsModal } from "../CreateSkillFromConventionsModal";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const locale = useLocale();
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const list = useConventions(repoId);
  const scan = useScanConventions(repoId);
  const update = useUpdateConvention(repoId);

  const [filter, setFilter] = React.useState<StatusFilter>("all");
  // null = the default selection (accepted, not yet in a skill), derived from data.
  const [selection, setSelection] = React.useState<Set<string> | null>(null);
  // An id, not a snapshot: the modal always edits the row as the cache has it now.
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const repoFullName = activeRepo?.id === repoId ? activeRepo.full_name : null;
  const repoName = repoFullName?.split("/").pop() ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const page = list.data;
  const candidates = page?.candidates ?? [];
  const selected = selection ?? defaultSelection(candidates);
  const selectedIds = selectedAccepted(candidates, selected);
  const counts = countByStatus(candidates);
  const visible = filterByStatus(candidates, filter);
  const editing = editingId ? candidates.find((c) => c.id === editingId) : undefined;
  const acceptedIds = candidates.filter((c) => statusOf(c) === "accepted").map((c) => c.id);
  const allSelected = acceptedIds.length > 0 && selectedIds.length === acceptedIds.length;
  const scanError = scan.error instanceof ApiError ? scan.error.message : null;
  const nothingFound = scan.data && scan.data.kept === 0 ? scan.data : null;
  // The scan reply always describes the scan that just ran; the list can lag
  // (a scan that kept nothing stores no meta), so take the newer of the two.
  const scanMeta = newestScan(scan.data?.scan, page?.scan);

  const runScan = () => {
    scan.mutate(undefined, { onSuccess: () => setSelection(null) });
  };

  const setStatus = (c: ConventionCandidate, status: "accepted" | "rejected") => {
    update.mutate(
      { id: c.id, patch: { status } },
      {
        // An explicit selection picks up a newly accepted rule; the default one derives it.
        // Functional update: the selection may have changed while the PATCH was in flight.
        onSuccess: (updated) => {
          if (statusOf(updated) !== "accepted") return;
          setSelection((prev) => (prev ? new Set(prev).add(updated.id) : prev));
        },
      },
    );
  };

  return (
    <AppShell crumb={crumb}>
      {editing && (
        <EditConventionModal
          key={editing.id}
          repoId={repoId}
          candidate={editing}
          onClose={() => setEditingId(null)}
        />
      )}
      {creating && (
        <CreateSkillFromConventionsModal
          repoId={repoId}
          repoName={repoName}
          conventions={candidates.filter((c) => selectedIds.includes(c.id))}
          onClose={() => setCreating(false)}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span style={s.repo}>{repoName}</span>
            </h1>
            <p style={s.subtitle}>
              {scanMeta
                ? t("page.scanSummary", {
                    files: scanMeta.files_sampled,
                    when: formatRelative(scanMeta.at, new Date(), locale),
                  })
                : t("page.subtitle")}
            </p>
            {candidates.length > 0 && (
              <p style={s.count}>
                {t("page.acceptedCount", { accepted: counts.accepted, total: counts.all })}
              </p>
            )}
          </div>
          <div style={s.headerActions}>
            {scanMeta && (
              <Button icon="RefreshCw" loading={scan.isPending} disabled={scan.isPending} onClick={runScan}>
                {scan.isPending ? t("page.scanning") : t("page.rescan")}
              </Button>
            )}
            {candidates.length > 0 && (
              <Button
                kind="primary"
                icon="Sparkles"
                disabled={selectedIds.length === 0}
                onClick={() => setCreating(true)}
              >
                {t("page.createSkill")}
              </Button>
            )}
          </div>
        </div>

        {scanError && (
          <div style={s.errorBanner} role="alert">
            <Icon.AlertTriangle size={15} />
            <span>
              <strong>{t("page.extractionFailed")}</strong> — {scanError}
            </span>
          </div>
        )}

        {nothingFound && (
          <div style={s.infoBanner} role="status">
            <Icon.Info size={15} />
            <span>
              <strong>{t("page.nothingFound.title")}</strong> —{" "}
              {t("page.nothingFound.body", {
                files: nothingFound.scan?.files_sampled ?? 0,
                proposed: nothingFound.proposed,
                ungrounded: nothingFound.dropped_ungrounded,
                duplicate: nothingFound.dropped_duplicate,
              })}
            </span>
          </div>
        )}

        {list.isLoading ? (
          <div style={s.list}>
            {SKELETON_KEYS.map((key) => (
              <Skeleton key={key} height={120} />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState
            title={t("page.loadError")}
            body={list.error instanceof ApiError ? list.error.message : undefined}
            onRetry={() => list.refetch()}
          />
        ) : !scanMeta && candidates.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={scan.isPending ? t("page.scanning") : t("page.empty.cta")}
            onCta={runScan}
            ctaLoading={scan.isPending}
          />
        ) : candidates.length > 0 ? (
          <>
            <div style={s.toolbar}>
              <div style={s.filters}>
                {STATUS_FILTERS.map((f) => (
                  <Chip key={f} active={filter === f} count={counts[f]} onClick={() => setFilter(f)}>
                    {t(`page.filters.${f}`)}
                  </Chip>
                ))}
              </div>
              <div style={s.selection}>
                <Button
                  kind="ghost"
                  size="sm"
                  icon={allSelected ? "X" : "Check"}
                  disabled={acceptedIds.length === 0}
                  onClick={() => setSelection(allSelected ? new Set() : new Set(acceptedIds))}
                >
                  {allSelected ? t("page.selection.deselectAll") : t("page.selection.selectAll")}
                </Button>
                <span style={s.selectionCount}>
                  {t("page.selection.count", { count: selectedIds.length })}
                </span>
              </div>
            </div>

            <div style={s.list}>
              {visible.length === 0 ? (
                <p style={s.noneInFilter}>{t("page.noneInFilter")}</p>
              ) : (
                visible.map((c) => (
                  <ConventionCard
                    key={c.id}
                    candidate={c}
                    repoFullName={repoFullName}
                    commitSha={c.commit_sha ?? scanMeta?.commit_sha ?? null}
                    selected={selected.has(c.id)}
                    busy={update.isPending && update.variables?.id === c.id}
                    onToggleSelect={() => setSelection(toggleId(selected, c.id))}
                    onStatus={(status) => setStatus(c, status)}
                    onEdit={() => setEditingId(c.id)}
                  />
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
