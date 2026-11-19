/* Pure helpers for BlastRadiusCard — banner conditions (AC-45) and empty-state choice. */
import type { BannerCondition } from "@/components/graph-canvas";
import type { BlastRadiusResponse } from "@/lib/hooks/blast-radius";

type T = (key: string, values?: Record<string, string | number>) => string;

const short = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : "?");

export function activeReindexing(env: BlastRadiusResponse) {
  return env.reindexing ?? env.index?.reindexing ?? null;
}

/** Every active non-blocking notice, in a stable order. */
export function buildBanners(env: BlastRadiusResponse, t: T): BannerCondition[] {
  const out: BannerCondition[] = [];
  const reindexing = activeReindexing(env);
  if (reindexing) out.push({ id: "reindexing", tone: "info", text: t("banner.reindexing") });

  const trunc = env.graph?.truncation;
  if (trunc?.truncated) {
    out.push({
      id: "truncated",
      tone: "warning",
      text: trunc.totalsCapped ? `${t("banner.truncated")} ${t("banner.truncatedCapped")}` : t("banner.truncated"),
      stats: [
        { label: t("banner.nodesDropped"), value: trunc.nodesDropped },
        { label: t("banner.edgesDropped"), value: trunc.edgesDropped },
      ],
    });
  }

  if (env.status === "partial") out.push({ id: "partial", tone: "warning", text: t("banner.partial") });
  if (env.status === "degraded") out.push({ id: "degraded", tone: "warning", text: t("banner.degraded") });

  const o = env.overlay;
  if (o?.staleOverlay) {
    out.push({
      id: "staleOverlay",
      tone: "warning",
      text: o.baseSha
        ? t("banner.staleOverlay", { indexed: short(o.indexedSha), base: short(o.baseSha) })
        : t("banner.staleOverlayUnknown"),
    });
  }
  if (o?.overlayDegraded) {
    out.push({ id: "overlayDegraded", tone: "warning", text: t("banner.overlayDegraded", { count: o.degradedCount }) });
  }

  if (env.index?.lowConfidence) {
    const c = env.index.coverage;
    out.push({
      id: "lowConfidence",
      tone: "warning",
      text: t("banner.lowConfidence"),
      stats: c
        ? [
            { label: `${t("banner.coverageValue")} (${c.value.total})`, value: c.value.resolved },
            { label: `${t("banner.coverageType")} (${c.type.total})`, value: c.type.resolved },
          ]
        : undefined,
    });
  }
  return out;
}

/** Names of changed symbols the PR deletes (from the graph nodes). */
export function deletedSymbolNames(env: BlastRadiusResponse): Set<string> {
  return new Set((env.graph?.nodes ?? []).filter((n) => n.role === "changed" && n.deleted).map((n) => n.name));
}
