import type { RepoProvider } from "@/lib/types";
import type { ConventionCandidate } from "@devdigest/shared";
import { repoBlobUrl } from "@/lib/repo-urls";

/** Last path segment of `owner/name` (or nested GitLab groups). */
export function repoDisplayName(fullName: string | undefined, fallback: string): string {
  if (!fullName) return fallback;
  const parts = fullName.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? fallback;
}

export function pathRangeLabel(
  path: string,
  start: number | null | undefined,
  end: number | null | undefined,
): string {
  if (start == null) return path;
  if (end == null || end === start) return `${path}:${start}`;
  return `${path}:${start}-${end}`;
}

export function confidencePercent(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function confidenceBarColor(percent: number): string {
  return percent >= 80 ? "var(--ok)" : percent >= 65 ? "var(--warn)" : "var(--text-muted)";
}

export function evidenceHref(
  provider: RepoProvider,
  fullName: string,
  ref: string,
  path: string,
  start: number | null | undefined,
  end: number | null | undefined,
): string {
  return repoBlobUrl(
    provider,
    fullName,
    ref,
    path,
    start ?? undefined,
    end ?? undefined,
  );
}

/** Display-only heuristic — same as server `approxTokens` (`ceil(chars/4)`). Not billing. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function headingSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "convention";
}

export function defaultSkillName(fullName: string | undefined, fallback: string): string {
  return `${repoDisplayName(fullName, fallback)}-conventions`;
}

export function assembleSkillBody(
  name: string,
  repoLabel: string,
  rows: ConventionCandidate[],
): string {
  const sections = rows
    .filter((row) => row.status === "accepted")
    .map((row) => {
      const slug = headingSlug(row.category || row.rule);
      return `## ${slug}\n${row.rule}\nDetected in \`${pathRangeLabel(row.evidence_path, row.evidence_start_line, row.evidence_end_line)}\``;
    });
  return [
    `# ${name}`,
    "",
    `House conventions for '${repoLabel}'. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    "",
    ...sections,
  ]
    .join("\n")
    .trimEnd()
    .concat("\n");
}

export function formatLastScan(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
