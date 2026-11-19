/* BlastRadiusCard — specs/07-blast-radius.md + specs/18-dependency-graph.md.
   Own section on the Overview tab, next to IntentCard. A `List | Graph` toggle
   (default List) switches between the grouped caller list and the impact
   graph; both read the same `/pulls/:id/blast` envelope off repo-intel's
   persistent index (no LLM call). Non-blocking banners sit above either view.
   `file:line` links open the exact GitHub line at the PR head SHA. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Badge, EmptyState, Skeleton } from "@devdigest/ui";
import { GraphBanner, LiveRegion, useAnnouncer } from "@/components/graph-canvas";
import { useBlastRadius } from "@/lib/hooks/blast-radius";
import { ImpactGraph } from "../ImpactGraph";
import { BlastList } from "./BlastList";
import { activeReindexing, buildBanners } from "./helpers";
import { s } from "./styles";

interface BlastRadiusCardProps {
  prId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}

type View = "list" | "graph";

export function BlastRadiusCard({ prId, repoFullName, headSha }: BlastRadiusCardProps) {
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
        <SectionLabel icon="Target">{t("title")}</SectionLabel>
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

  const callerCount = blast.downstream.reduce((n, g) => n + g.callers.length, 0);
  const endpointCount = new Set(blast.downstream.flatMap((g) => g.endpoints_affected)).size;
  const cronCount = new Set(blast.downstream.flatMap((g) => g.crons_affected)).size;
  const empty = blast.changed_symbols.length === 0 && (graph?.nodes.length ?? 0) === 0;

  return (
    <section>
      <SectionLabel icon="Target">{t("title")}</SectionLabel>
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
          <div role="group" aria-label={t("view.label")} style={s.toggle}>
            {(["list", "graph"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => choose(v)}
                style={view === v ? s.toggleOn : s.toggleOff}
              >
                {t(`view.${v}`)}
              </button>
            ))}
          </div>

          {blast.changed_symbols.length > 0 && (
            <div style={s.statsRow}>
              <Badge icon="Code">{t("stat.symbols", { count: blast.changed_symbols.length })}</Badge>
              <Badge icon="CornerDownRight">{t("stat.callers", { count: callerCount })}</Badge>
              {endpointCount > 0 && <Badge icon="Globe">{t("stat.endpoints", { count: endpointCount })}</Badge>}
              {cronCount > 0 && <Badge icon="Clock">{t("stat.crons", { count: cronCount })}</Badge>}
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
            />
          ) : blast.downstream.length === 0 && !(graph?.entryPoints.items.length || graph?.tests.items.length) ? (
            <div style={s.noCallers}>{t("state.noCallers", { count: blast.changed_symbols.length })}</div>
          ) : (
            <BlastList envelope={envelope} repoFullName={repoFullName} headSha={headSha} />
          )}
        </>
      )}
    </section>
  );
}
