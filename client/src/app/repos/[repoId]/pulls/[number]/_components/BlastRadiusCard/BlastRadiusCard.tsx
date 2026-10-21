/* BlastRadiusCard — the PR's impact map, rendered by OverviewTab: a stat row
   (symbols · callers · endpoints · crons), a Tree / Graph toggle, and the
   "Prior PRs touching these files" disclosure. Data is read-time from the repo
   index (GET /pulls/:id/blast); a degraded, empty map offers a resync and the
   card refetches itself once the index row advances. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Card, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/blast";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { BlastTree } from "./_components/BlastTree";
import { BlastGraph } from "./_components/BlastGraph";
import { PriorPrs } from "./_components/PriorPrs";
import type { BlastView } from "./constants";
import { computeStats, reasonKey } from "./helpers";
import { s } from "./styles";

export function BlastRadiusCard({
  prId,
  repoId,
  repoFullName,
}: {
  prId: string | null;
  repoId: string | null;
  repoFullName: string | null;
}) {
  const t = useTranslations("blast");
  const qc = useQueryClient();
  const { data, isLoading } = useBlastRadius(prId);
  const resync = useResyncRepoIntel(repoId);
  const [view, setView] = React.useState<BlastView>("tree");

  // A resync is a 202 and finishes in the background: remember the index row's
  // timestamp at click time, poll it, and refetch the map once it advances.
  const [rebuildFrom, setRebuildFrom] = React.useState<string | null>(null);
  const { data: intel } = useRepoIntelStatus(repoId, rebuildFrom !== null);
  React.useEffect(() => {
    if (rebuildFrom === null || !intel || intel.updatedAt === rebuildFrom) return;
    setRebuildFrom(null);
    void qc.invalidateQueries({ queryKey: ["blast", prId] });
  }, [rebuildFrom, intel, prId, qc]);
  const startRebuild = () => {
    setRebuildFrom(intel?.updatedAt ?? "");
    resync.mutate(undefined, { onError: () => setRebuildFrom(null) });
  };
  const rebuilding = resync.isPending || rebuildFrom !== null;

  const label = (
    <span style={s.label}>
      <Icon.Workflow size={14} />
      {t("title")}
    </span>
  );

  if (isLoading) {
    return (
      <Card>
        <div style={s.headRow}>{label}</div>
        <div style={s.skeletonWrap}>
          <Skeleton height={80} />
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <div style={s.headRow}>{label}</div>
        <div style={s.reason}>{t("loadFailed")}</div>
      </Card>
    );
  }

  const noMap = data.changed_symbols.length === 0 && data.downstream.length === 0;
  if (data.degraded && noMap) {
    const ctaLabel = rebuilding ? t("rebuilding") : t("rebuild");
    return (
      <Card>
        <div style={s.headRow}>{label}</div>
        <EmptyState
          icon="Workflow"
          title={t("empty.title")}
          body={t(`empty.${reasonKey(data.reason)}`)}
          cta={repoId ? ctaLabel : undefined}
          onCta={repoId ? startRebuild : undefined}
          ctaLoading={rebuilding}
        />
      </Card>
    );
  }

  const stats = computeStats(data);
  const statItems: { key: keyof typeof stats; icon: React.ReactNode }[] = [
    { key: "symbols", icon: <Icon.Code size={13} style={s.statIcon} /> },
    { key: "callers", icon: <Icon.CornerDownRight size={13} style={s.statIcon} /> },
    { key: "endpoints", icon: <Icon.Globe size={13} style={s.statIcon} /> },
    { key: "crons", icon: <Icon.Clock size={13} style={s.statIcon} /> },
  ];

  return (
    <Card>
      <div style={s.headRow}>
        {label}
        <span style={s.spacer} />
        {data.degraded && (
          <span title={t("approximateHint")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("approximate")}
            </Badge>
          </span>
        )}
      </div>

      <div style={s.statRow}>
        {statItems.map(({ key, icon }) => (
          <span key={key} style={s.stat}>
            {icon}
            <span className="tnum" style={s.statNum}>
              {stats[key]}
            </span>
            <span>{t(`stat.${key}`, { count: stats[key] })}</span>
          </span>
        ))}
        <span style={s.spacer} />
        <div role="group" aria-label={t("view.label")} style={s.segmented}>
          {(["tree", "graph"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} style={s.segment(view === v)} onClick={() => setView(v)}>
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
      </div>

      <div style={s.body}>
        {view === "tree" ? (
          // Keyed by the head so the open-row set resets when a new map arrives.
          <BlastTree key={data.head_sha} data={data} repoFullName={repoFullName} headSha={data.head_sha} />
        ) : (
          <BlastGraph data={data} />
        )}
      </div>

      <PriorPrs items={data.history} repoFullName={repoFullName} />
    </Card>
  );
}
