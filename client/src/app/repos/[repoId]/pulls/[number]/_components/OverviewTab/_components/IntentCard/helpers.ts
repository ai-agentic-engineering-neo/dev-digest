import type { IntentSource } from "@devdigest/shared";
import { githubBlobUrl, githubIssueUrl } from "@/lib/github-urls";
import { KNOWN_REASONS, LINKABLE_KINDS } from "./constants";

/** Link for a source ref we can point at on github.com; null otherwise. */
export function sourceHref(
  source: IntentSource,
  repoFullName: string | null | undefined,
  headSha: string | null | undefined,
): string | null {
  if (!repoFullName || !LINKABLE_KINDS.has(source.kind)) return null;
  if (source.kind === "github_issue") {
    const m = /^#(\d+)$/.exec(source.ref);
    return m ? githubIssueUrl(repoFullName, Number(m[1])) : null;
  }
  // repo_doc: a repo-relative path read at the PR head.
  return headSha ? githubBlobUrl(repoFullName, headSha, source.ref) : null;
}

/** i18n key suffix for a reason code, or null when we have no translation. */
export function reasonKey(reason: string | undefined): string | null {
  return reason && KNOWN_REASONS.has(reason) ? reason : null;
}
