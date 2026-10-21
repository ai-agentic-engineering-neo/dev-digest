/* repo-context.tsx — tracks the active repo for the shell + :repoId routing.
   Priority: repoId in the URL path > localStorage > first repo from the API. */
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useRepos } from "./hooks";
import type { Repo } from "./types";

/** A page's veto over a sidebar repository change: it must call `proceed` once the change may go ahead. */
export type RepoChangeGuard = (proceed: () => void) => void;

const RepoCtx = React.createContext<{
  repoId: string | null;
  setRepoId: (id: string) => void;
  /** Run `proceed` now, or hand it to the registered guard (unsaved changes) to run after confirmation. */
  requestRepoChange: (id: string, proceed: () => void) => void;
  registerRepoGuard: (guard: RepoChangeGuard | null) => void;
  repos: Repo[];
  activeRepo: Repo | null;
  reposLoaded: boolean;
}>({
  repoId: null,
  setRepoId: () => {},
  requestRepoChange: (_id, proceed) => proceed(),
  registerRepoGuard: () => {},
  repos: [],
  activeRepo: null,
  reposLoaded: false,
});

function repoIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/repos\/([^/]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

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

  // One guard at a time (the last registered wins); a ref, so registering never re-renders the shell.
  const guardRef = React.useRef<RepoChangeGuard | null>(null);
  const registerRepoGuard = React.useCallback((guard: RepoChangeGuard | null) => {
    guardRef.current = guard;
  }, []);
  const requestRepoChange = React.useCallback((_id: string, proceed: () => void) => {
    const guard = guardRef.current;
    if (guard) guard(proceed);
    else proceed();
  }, []);

  const list = repos ?? [];
  const fromPath = repoIdFromPath(pathname);
  const repoId = fromPath ?? stored ?? list[0]?.id ?? null;
  const activeRepo = list.find((r) => r.id === repoId) ?? null;

  return (
    <RepoCtx.Provider value={{ repoId, setRepoId, requestRepoChange, registerRepoGuard, repos: list, activeRepo, reposLoaded }}>
      {children}
    </RepoCtx.Provider>
  );
}

export function useActiveRepo() {
  return React.useContext(RepoCtx);
}

/**
 * Register a guard that can hold back a sidebar repository change while the
 * page has unsaved work; pass null when there is nothing to protect. The guard
 * is dropped when the page unmounts.
 */
export function useRepoChangeGuard(guard: RepoChangeGuard | null): void {
  const { registerRepoGuard } = useActiveRepo();
  React.useEffect(() => {
    registerRepoGuard(guard);
    return () => registerRepoGuard(null);
  }, [guard, registerRepoGuard]);
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
