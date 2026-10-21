"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ShellContext } from "@devdigest/ui";
import { useTheme } from "../../../lib/theme";
import { useActiveRepo } from "../../../lib/repo-context";
import { usePulls, useDeleteRepo } from "../../../lib/hooks";
import { activeKeyFor, repoSwitchTarget, toShellRepo } from "../helpers";

interface ShellContextOptions {
  onOpenCommandPalette: () => void;
}

/** The one page that follows the sidebar's repo without being under /repos/:id. */
const CONTEXT_PATH = "/context";

/**
 * Assembles the `ShellContext` consumed by AppFrame: active nav key, the repo
 * list/active repo (mapped to the shell shape), theme, PR count, and the repo
 * selection / add / removal actions.
 */
export function useShellContext({ onOpenCommandPalette }: ShellContextOptions): ShellContext {
  const t = useTranslations("shell");
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { repoId, repos, activeRepo, setRepoId, requestRepoChange } = useActiveRepo();
  const { data: pulls } = usePulls(repoId);
  const deleteRepo = useDeleteRepo();

  const onSelectRepo = React.useCallback(
    (id: string) =>
      // a page with unsaved changes may hold the switch back until the user confirms
      requestRepoChange(id, () => {
        setRepoId(id);
        // Project Context is not repo-scoped in its URL: stay on the page and let
        // it reload for the new repo (the selected document belongs to the old one).
        if (pathname.startsWith(CONTEXT_PATH)) router.replace(CONTEXT_PATH);
        else router.push(repoSwitchTarget(pathname, id));
      }),
    [requestRepoChange, setRepoId, router, pathname],
  );

  const onAddRepo = React.useCallback(() => router.push("/onboarding"), [router]);

  const onRemoveRepo = React.useCallback(
    (id: string) => {
      const target = repos.find((r) => r.id === id);
      const ok = window.confirm(
        t("removeRepo.confirm", { name: target?.full_name ?? t("removeRepo.fallbackName") }),
      );
      if (!ok) return;
      deleteRepo.mutate(id, {
        onSuccess: () => {
          if (repoId === id) {
            const next = repos.find((r) => r.id !== id);
            router.push(next ? `/repos/${next.id}/pulls` : "/onboarding");
          }
        },
      });
    },
    [repos, repoId, t, deleteRepo, router],
  );

  return React.useMemo<ShellContext>(
    () => ({
      Link,
      activeKey: activeKeyFor(pathname),
      repoId,
      repos: repos.map(toShellRepo),
      activeRepo: activeRepo ? toShellRepo(activeRepo) : null,
      theme,
      onToggleTheme: toggle,
      onOpenCommandPalette,
      onSelectRepo,
      onAddRepo,
      onRemoveRepo,
      // Sidebar badge = PRs that still NEED review, not the total PR count.
      // 0 → undefined so the badge hides entirely when nothing needs review.
      prCount: pulls?.filter((p) => p.status === "needs_review").length || undefined,
    }),
    [
      pathname,
      repoId,
      repos,
      activeRepo,
      theme,
      toggle,
      onOpenCommandPalette,
      onSelectRepo,
      onAddRepo,
      onRemoveRepo,
      pulls,
    ],
  );
}
