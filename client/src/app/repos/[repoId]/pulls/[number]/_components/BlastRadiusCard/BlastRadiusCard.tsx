/* BlastRadiusCard — specs/07-blast-radius.md + specs/18-dependency-graph.md.
   Own section on the Overview tab, next to IntentCard. A `List | Graph` toggle
   (default List) switches between the grouped caller list and the impact
   graph; both read the same `/pulls/:id/blast` envelope off repo-intel's
   persistent index (no LLM call). Non-blocking banners sit above either view.
   `file:line` links open the exact GitHub line at the PR head SHA. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, EmptyState, Icon, Skeleton, type IconName } from "@devdigest/ui";
import { GraphBanner, LiveRegion, useAnnouncer } from "@/components/graph-canvas";
import { useBlastRadius } from "@/lib/hooks/blast-radius";
import { HelpTip } from "@/components/help-tip";
import { ImpactGraph } from "../ImpactGraph";
import { BlastList } from "./BlastList";
import { activeReindexing, blastStats, buildBanners } from "./helpers";
import { s } from "./styles";

interface BlastRadiusCardProps {
  prId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Opens a changed file in the Files tab. */
  onFocusFile?: (file: string, line: number | null) => void;
}

type View = "list" | "graph";

export function BlastRadiusCard({ prId, repoFullName, headSha, onFocusFile }: BlastRadiusCardProps) {
  const t = useTranslations("impactGraph");
  const [view, setView] = useState<View>("list");
  const [includeTypeOnly, setIncludeTypeOnly] = useState(true);
  const { message, announce } = useAnnouncer();
  const { data: envelope, isLoading, isError, isFetching, refetch } = useBlastRadius(prId, { includeTypeOnly });

  const choose = (v: View) => {
    setView(v);
    announce(v === "list" ? t("view.announceList") : t("view.announceGraph"));
  };

  if (!envelope) {
    return (
      <section>
        <SectionLabel icon="Target" info={<HelpTip topic="blast" />}>
          {t("title")}
        </SectionLabel>
        {isError && !isLoading ? (
          <div style={s.banner} role="alert">
            <span>{t("state.error")}</span>
            <button type="button" onClick={() => void refetch()}>
              {t("state.retry")}
            </button>
          </div>
        ) : (
          <div style={s.loadingStack} role="status" aria-label={t("state.loading")}>
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        )}
      </section>
    );
  }

  const { data: blast, graph } = envelope;
  const reindexing = activeReindexing(envelope);
  const banners = buildBanners(envelope, t);

  const stats = blastStats(envelope);
  const empty = blast.changed_symbols.length === 0 && (graph?.nodes.length ?? 0) === 0;

  return (
    <section>
      <SectionLabel
        icon="Target"
        info={<HelpTip topic="blast" />}
        right={
          reindexing ? undefined : (
            <div role="group" aria-label={t("view.label")} style={s.toggle}>
              {(["list", "graph"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => choose(v)}
                  style={view === v ? s.toggleOn : s.toggleOff}
                >
                  {v === "list" ? <Icon.ListChecks size={13} aria-hidden /> : <Icon.Workflow size={13} aria-hidden />}
                  {t(`view.${v}`)}
                </button>
              ))}
            </div>
          )
        }
      >
        {t("title")}
      </SectionLabel>
      <LiveRegion message={reindexing ? t("banner.reindexing") : message} />

      {reindexing ? (
        <>
          <GraphBanner conditions={banners} />
          <div style={s.progress} role="status">
            <strong>{t("state.reindexingTitle")}</strong>
            <progress value={reindexing.done} max={Math.max(reindexing.total, 1)} />
            <span>
              {t("state.reindexingProgress", {
                state: reindexing.state,
                done: reindexing.done,
                total: reindexing.total,
              })}
            </span>
            <span>{t("state.reindexingBody")}</span>
          </div>
        </>
      ) : (
        <>
          {blast.changed_symbols.length > 0 && (
            <div style={s.statsRow}>
              <StatTile
                icon="Edit"
                tone="var(--warn)"
                value={stats.symbols}
                label={t("tile.symbols")}
                help="tileSymbols"
                sub={t("tile.inFiles", { count: stats.changedFiles })}
              />
              <StatTile
                icon="CornerDownRight"
                tone="var(--accent-text)"
                value={stats.callers}
                label={t("tile.callers")}
                help="tileCallSites"
                sub={
                  stats.typeOnlyCallers > 0
                    ? t("tile.typeOnlyShare", { count: stats.typeOnlyCallers })
                    : t("tile.allRuntime")
                }
              />
              <StatTile
                icon="FileText"
                tone="var(--text-secondary)"
                value={stats.callerFiles}
                label={t("tile.files")}
                help="tileFiles"
                sub={t("tile.filesSub")}
              />
              <StatTile
                icon="Globe"
                tone="var(--ok)"
                value={stats.entryPoints}
                label={t("tile.entryPoints")}
                help="tileEntryPoints"
                sub={t("tile.entryPointsSub")}
              />
              <StatTile
                icon="FlaskConical"
                tone="var(--info)"
                value={stats.tests}
                label={t("tile.tests")}
                help="tileTests"
                sub={t("tile.testsSub")}
              />
            </div>
          )}

          {banners.length > 0 && (
            <div style={s.bannerWrap}>
              <GraphBanner conditions={banners} />
            </div>
          )}

          {empty ? (
            <EmptyState
              icon="Target"
              title={t("state.emptyTitle")}
              body={envelope.index?.lowConfidence ? t("state.emptyLowConfidence") : t("state.emptyFull")}
            />
          ) : view === "graph" && graph ? (
            <ImpactGraph
              graph={graph}
              repoFullName={repoFullName}
              headSha={headSha}
              includeTypeOnly={includeTypeOnly}
              onIncludeTypeOnlyChange={setIncludeTypeOnly}
              isUpdating={isFetching}
              onFocusFile={onFocusFile}
            />
          ) : blast.downstream.length === 0 && !(graph?.entryPoints.items.length || graph?.tests.items.length) ? (
            <div style={s.noCallers}>{t("state.noCallers", { count: blast.changed_symbols.length })}</div>
          ) : (
            <BlastList envelope={envelope} repoFullName={repoFullName} headSha={headSha} onFocusFile={onFocusFile} />
          )}
        </>
      )}
    </section>
  );
}

function StatTile({
  icon,
  tone,
  value,
  label,
  sub,
  help,
}: {
  icon: IconName;
  tone: string;
  value: number;
  label: string;
  sub: string;
  /** help.json topic explaining the metric. */
  help: string;
}) {
  const I = Icon[icon];
  return (
    <div style={s.tile}>
      <div style={s.tileHead}>
        <I size={13} style={{ color: tone }} aria-hidden />
        <span>{label}</span>
        <HelpTip topic={help} size={12} />
      </div>
      <div className="tnum" style={s.tileValue}>
        {value}
      </div>
      <div style={s.tileSub}>{sub}</div>
    </div>
  );
}
