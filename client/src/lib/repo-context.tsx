/* repo-context.tsx — tracks the active repo for the shell + :repoId routing.
   Priority: repoId in the URL path > localStorage > first repo from the API. */
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useRepos } from "./hooks";
import type { Repo } from "./types";

const RepoCtx = React.createContext<{
  repoId: string | null;
  setRepoId: (id: string) => void;
  repos: Repo[];
  activeRepo: Repo | null;
  reposLoaded: boolean;
}>({ repoId: null, setRepoId: () => {}, repos: [], activeRepo: null, reposLoaded: false });

function repoIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/repos\/([^/]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

// Stable reference (not `repos ?? []`) so `list` doesn't change identity on
// every render while repos are still loading — see the useMemo below.
const EMPTY_REPOS: Repo[] = [];

export function RepoProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: repos, isSuccess: reposLoaded } = useRepos();
  const [stored, setStored] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setStored(localStorage.getItem("dd-repo"));
    } catch {
      /* ignore */
    }
  }, []);

  const setRepoId = React.useCallback((id: string) => {
    setStored(id);
    try {
      localStorage.setItem("dd-repo", id);
    } catch {
      /* ignore */
    }
  }, []);

  const list = repos ?? EMPTY_REPOS;
  const fromPath = repoIdFromPath(pathname);
  const repoId = fromPath ?? stored ?? list[0]?.id ?? null;
  const activeRepo = list.find((r) => r.id === repoId) ?? null;

  // RepoProvider sits near the root of the provider stack and re-renders on
  // every navigation (usePathname) — memoize the context value so consumers
  // (useActiveRepo, every repo-scoped page) don't re-render when repoId/repos/
  // activeRepo/reposLoaded are all referentially unchanged.
  const value = React.useMemo(
    () => ({ repoId, setRepoId, repos: list, activeRepo, reposLoaded }),
    [repoId, setRepoId, list, activeRepo, reposLoaded],
  );

  return <RepoCtx.Provider value={value}>{children}</RepoCtx.Provider>;
}

export function useActiveRepo() {
  return React.useContext(RepoCtx);
}

/**
 * True once the repos list has loaded and the given :repoId matches none of
 * them — i.e. a stale/invalid repo in the URL ("no repo selected"). Repo-scoped
 * pages use this to show a friendly empty state instead of a "Repo not found"
 * error. Returns false while repos are still loading (avoids a flash) and on a
 * repos fetch failure (let the page surface its real error in that case).
 */
export function useRepoNotFound(repoId: string | null | undefined): boolean {
  const { repos, reposLoaded } = useActiveRepo();
  return reposLoaded && repoId != null && !repos.some((r) => r.id === repoId);
}
