/* repo-urls.ts — build code-host deep-links from data we already hold.
   PR detail has repo full_name (owner/repo) + provider, PR number, head sha,
   and finding file/line — enough to open the PR/MR or a file blob at a line
   range in a new tab, on GitHub or GitLab. */
import type { RepoProvider } from "./types";

const HOST: Record<RepoProvider, string> = {
  github: "https://github.com",
  gitlab: "https://gitlab.com",
};

const PLATFORM_LABEL: Record<RepoProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
};

/** Human-readable code-host name for a repo's provider (button/copy text). */
export function platformLabel(provider: RepoProvider): string {
  return PLATFORM_LABEL[provider];
}

/** Encode a repo-relative path for a URL while keeping "/" separators. */
function encPath(file: string): string {
  return file
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

/**
 * GitHub: https://github.com/{owner}/{repo}/pull/{number}
 * GitLab: https://gitlab.com/{owner}/{repo}/-/merge_requests/{number}
 */
export function repoPrUrl(provider: RepoProvider, repoFullName: string, number: number): string {
  const segment = provider === "gitlab" ? "-/merge_requests" : "pull";
  return `${HOST[provider]}/${repoFullName}/${segment}/${number}`;
}

/**
 * GitHub: https://github.com/{owner}/{repo}/blob/{sha}/{file}#L{start}[-L{end}]
 * GitLab: https://gitlab.com/{owner}/{repo}/-/blob/{sha}/{file}#L{start}[-{end}]
 * `sha` pins the link to the PR's head so line numbers stay accurate.
 */
export function repoBlobUrl(
  provider: RepoProvider,
  repoFullName: string,
  sha: string,
  file: string,
  startLine?: number,
  endLine?: number,
): string {
  const segment = provider === "gitlab" ? "-/blob" : "blob";
  let url = `${HOST[provider]}/${repoFullName}/${segment}/${sha}/${encPath(file)}`;
  if (startLine != null) {
    if (provider === "gitlab") {
      url += `#L${startLine}`;
      if (endLine != null && endLine !== startLine) url += `-${endLine}`;
    } else {
      url += `#L${startLine}`;
      if (endLine != null && endLine !== startLine) url += `-L${endLine}`;
    }
  }
  return url;
}
