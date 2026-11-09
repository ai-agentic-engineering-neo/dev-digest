import { githubBlobUrl } from "@/lib/github-urls";

/** `path:line` when a line is known, else `path`. */
export function fileLocation(path: string, line: number | null): string {
  return line === null ? path : `${path}:${line}`;
}

/** GitHub blob URL pinned to the indexed commit; `null` without repo or sha. */
export function briefRefHref(
  path: string,
  line: number | null,
  repoFullName: string | null,
  linkSha: string | null,
): string | null {
  if (!repoFullName || !linkSha) return null;
  return githubBlobUrl(repoFullName, linkSha, path, line ?? undefined);
}
