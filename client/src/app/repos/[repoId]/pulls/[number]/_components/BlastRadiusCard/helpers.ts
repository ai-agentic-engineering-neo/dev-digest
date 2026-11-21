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

// ---- List view ------------------------------------------------------------

type Downstream = BlastRadiusResponse["data"]["downstream"][number];
type Caller = Downstream["callers"][number];

/** `a/b/c.ts` → `{ dir: "a/b/", base: "c.ts" }` — dir rendered muted, base bold. */
export function splitPath(path: string): { dir: string; base: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", base: path } : { dir: path.slice(0, i + 1), base: path.slice(i + 1) };
}

export interface CallerFile {
  file: string;
  sites: { line: number; name: string; typeOnly: boolean }[];
  /** Every call site in this file is type-only. */
  typeOnly: boolean;
}

/** Callers of one changed symbol, grouped by file (file order = first appearance), lines ascending. */
export function groupCallersByFile(callers: Caller[]): CallerFile[] {
  const byFile = new Map<string, CallerFile>();
  for (const c of callers) {
    let f = byFile.get(c.file);
    if (!f) {
      f = { file: c.file, sites: [], typeOnly: true };
      byFile.set(c.file, f);
    }
    f.sites.push({ line: c.line, name: c.name, typeOnly: !!c.type_only });
    if (!c.type_only) f.typeOnly = false;
  }
  for (const f of byFile.values()) f.sites.sort((a, b) => a.line - b.line);
  return [...byFile.values()];
}

/** Groups sorted by caller count (desc), filtered by a case-insensitive query over symbol, file and caller names. */
export function filterGroups(groups: Downstream[], query: string, fileOf: (symbol: string) => string | undefined) {
  const q = query.trim().toLowerCase();
  const sorted = [...groups].sort((a, b) => b.callers.length - a.callers.length || a.symbol.localeCompare(b.symbol));
  if (!q) return sorted;
  return sorted
    .map((g) => {
      const selfHit = g.symbol.toLowerCase().includes(q) || (fileOf(g.symbol) ?? "").toLowerCase().includes(q);
      if (selfHit) return g;
      const callers = g.callers.filter((c) => c.file.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
      return callers.length ? { ...g, callers } : null;
    })
    .filter((g): g is Downstream => g !== null);
}

/** Headline numbers for the stat tiles. */
export function blastStats(env: BlastRadiusResponse) {
  const callers = env.data.downstream.flatMap((g) => g.callers);
  return {
    symbols: env.data.changed_symbols.length,
    changedFiles: new Set(env.data.changed_symbols.map((c) => c.file)).size,
    callers: callers.length,
    typeOnlyCallers: callers.filter((c) => c.type_only).length,
    callerFiles: new Set(callers.map((c) => c.file)).size,
    entryPoints: env.graph?.entryPoints.total ?? new Set(env.data.downstream.flatMap((g) => g.endpoints_affected)).size,
    tests: env.graph?.tests.total ?? 0,
  };
}
