import { githubBlobUrl } from "@/lib/github-urls";

export interface TourRepoRef {
  full_name: string;
  default_branch: string;
}

/** Where "Open" goes: the file on GitHub at the default branch. */
export function openUrl(repo: TourRepoRef, path: string): string {
  return githubBlobUrl(repo.full_name, repo.default_branch, path);
}
