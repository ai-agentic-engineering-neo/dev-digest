/* IntentCard helpers — confidence → color, source kind → icon, source → a
   client-built github.com link (server/specs/05-intent-layer.md: the client
   builds every link, never a server-echoed URL). */
import type { IntentConfidence, IntentSource, IntentSourceKind, IntentSourceStatus } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import { githubBlobUrl, githubIssueUrl } from "@/lib/github-urls";

export function confidenceColor(confidence: IntentConfidence | null | undefined): { fg: string; bg: string } {
  if (confidence === "high") return { fg: "var(--ok)", bg: "var(--ok-bg)" };
  if (confidence === "medium") return { fg: "var(--warn)", bg: "var(--warn-bg)" };
  return { fg: "var(--text-muted)", bg: "var(--bg-hover)" };
}

const SOURCE_ICON: Record<IntentSourceKind, IconName> = {
  title: "Hash",
  body: "MessageSquare",
  ticket: "Link",
  doc: "FileText",
  commits: "GitCommit",
  branch: "GitBranch",
  diff: "Layers",
};

export function sourceIcon(kind: IntentSourceKind): IconName {
  return SOURCE_ICON[kind] ?? "Hash";
}

/** undefined when there's nothing sensible to link to (title/body/commits/branch/diff). */
export function sourceHref(source: IntentSource, repoFullName: string, headSha: string | null): string | undefined {
  if (source.kind === "ticket") {
    const n = Number(source.ref);
    return Number.isFinite(n) ? githubIssueUrl(repoFullName, n) : undefined;
  }
  if (source.kind === "doc" && headSha) {
    return githubBlobUrl(repoFullName, headSha, source.ref);
  }
  return undefined;
}

/** `used`/`truncated` read as normal text; `skipped`/`failed` are muted (never an error). */
export function isSourceOk(status: IntentSourceStatus): boolean {
  return status === "used" || status === "truncated";
}
