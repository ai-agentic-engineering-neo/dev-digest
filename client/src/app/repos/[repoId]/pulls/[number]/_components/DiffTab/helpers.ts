import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import { AUTO_EXPAND_MAX_LINES } from "@/components/diff-viewer";
import type { PrFile, SmartDiff, SmartDiffRole } from "@/lib/types";
import { COLLAPSED_ROLES, SMART_DIFF_GROUP_ORDER } from "./constants";

export interface DiffGroupView {
  role: SmartDiffRole;
  files: PrFile[];
}

function isNewer(a: ReviewRecord, b: ReviewRecord): boolean {
  if (a.created_at !== b.created_at) return a.created_at > b.created_at;
  return a.id > b.id;
}

/** Newest kind='review' row per agent (null agent = one bucket). Same rule as the server. */
export function latestReviewsPerAgent(reviews: readonly ReviewRecord[]): ReviewRecord[] {
  const latest = new Map<string | null, ReviewRecord>();
  for (const r of reviews) {
    if (r.kind !== "review") continue;
    const cur = latest.get(r.agent_id);
    if (!cur || isNewer(r, cur)) latest.set(r.agent_id, r);
  }
  return [...latest.values()];
}

/** Findings of the latest review per agent that sit in PR files (dismissed included). */
export function diffFindings(reviews: readonly ReviewRecord[], paths: ReadonlySet<string>): FindingRecord[] {
  return latestReviewsPerAgent(reviews).flatMap((r) => r.findings.filter((f) => paths.has(f.file)));
}

/** Number of files with at least one non-dismissed finding. */
export function countFilesWithFindings(paths: readonly string[], findings: readonly FindingRecord[]): number {
  const withActive = new Set(findings.filter((f) => f.dismissed_at === null).map((f) => f.file));
  return paths.filter((p) => withActive.has(p)).length;
}

/** Σ(tokens_in + tokens_out) of the runs behind the given latest reviews. */
export function reviewTokens(latest: readonly ReviewRecord[], runs: readonly RunSummary[]): number {
  const byId = new Map(runs.map((r) => [r.run_id, r]));
  let total = 0;
  for (const review of latest) {
    if (review.run_id === null) continue;
    const run = byId.get(review.run_id);
    if (run) total += (run.tokens_in ?? 0) + (run.tokens_out ?? 0);
  }
  return total;
}

/** Always five groups in display order; files ordered as GitHub returned them. */
export function buildGroupViews(smart: SmartDiff, files: readonly PrFile[]): DiffGroupView[] {
  const order = new Map(files.map((f, i) => [f.path, i]));
  const byPath = new Map(files.map((f) => [f.path, f]));
  const grouped = new Set<string>();
  const rank = (p: string) => order.get(p) ?? Number.MAX_SAFE_INTEGER;

  const views = SMART_DIFF_GROUP_ORDER.map((role): DiffGroupView => {
    const group = smart.groups.find((g) => g.role === role);
    const groupFiles = (group?.files ?? []).map((sf): PrFile => {
      grouped.add(sf.path);
      return byPath.get(sf.path) ?? { path: sf.path, additions: sf.additions, deletions: sf.deletions, patch: null };
    });
    return { role, files: groupFiles.sort((a, b) => rank(a.path) - rank(b.path)) };
  });

  const orphans = files.filter((f) => !grouped.has(f.path));
  const [core, ...rest] = views;
  if (!core || orphans.length === 0) return views;
  return [{ ...core, files: [...core.files, ...orphans] }, ...rest];
}

export function defaultFileOpen(role: SmartDiffRole, file: Pick<PrFile, "additions" | "deletions">): boolean {
  if (COLLAPSED_ROLES.has(role)) return false;
  return file.additions + file.deletions <= AUTO_EXPAND_MAX_LINES;
}
