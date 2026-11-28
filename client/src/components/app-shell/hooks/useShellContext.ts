"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ShellContext } from "@devdigest/ui";
import { useTheme } from "../../../lib/theme";
import { useActiveRepo } from "../../../lib/repo-context";
import { usePulls, useDeleteRepo } from "../../../lib/hooks";
import { activeKeyFor, toShellRepo } from "../helpers";

interface ShellContextOptions {
  onOpenCommandPalette: () => void;
}

interface PendingRemoval {
  name: string;
  confirm: () => void;
  cancel: () => void;
}

/**
 * Assembles the `ShellContext` consumed by AppFrame: active nav key, the repo
 * list/active repo (mapped to the shell shape), theme, PR count, and the repo
 * selection / add / removal actions. Removal is confirmed in a dialog:
 * `pendingRemoval` is set while one is open (null otherwise).
 */
export function useShellContext({ onOpenCommandPalette }: ShellContextOptions): {
  ctx: ShellContext;
  pendingRemoval: PendingRemoval | null;
} {
  const t = useTranslations("shell");
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { repoId, repos, activeRepo, setRepoId } = useActiveRepo();
  const { data: pulls } = usePulls(repoId);
  const deleteRepo = useDeleteRepo();

  const onSelectRepo = React.useCallback(
    (id: string) => {
      setRepoId(id);
      router.push(`/repos/${id}/pulls`);
    },
    [setRepoId, router],
  );

  const onAddRepo = React.useCallback(() => router.push("/onboarding"), [router]);

  const [removeId, setRemoveId] = React.useState<string | null>(null);
  const onRemoveRepo = React.useCallback((id: string) => setRemoveId(id), []);

  const confirmRemove = React.useCallback(
    (id: string) => {
      setRemoveId(null);
      deleteRepo.mutate(id, {
        onSuccess: () => {
          if (repoId === id) {
            const next = repos.find((r) => r.id !== id);
            router.push(next ? `/repos/${next.id}/pulls` : "/onboarding");
          }
        },
      });
    },
    [repos, repoId, deleteRepo, router],
  );

  const cancelRemove = React.useCallback(() => setRemoveId(null), []);
  const removeTarget = removeId ? repos.find((r) => r.id === removeId) : undefined;
  const pendingRemoval: PendingRemoval | null = removeId
    ? {
        name: removeTarget?.full_name ?? t("removeRepo.fallbackName"),
        confirm: () => confirmRemove(removeId),
        cancel: cancelRemove,
      }
    : null;

  const ctx = React.useMemo<ShellContext>(
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

  return { ctx, pendingRemoval };
}
