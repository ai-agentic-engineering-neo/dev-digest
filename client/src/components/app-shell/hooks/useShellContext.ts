"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ShellContext } from "@devdigest/ui";
import { useTheme } from "@/lib/theme";
import { useActiveRepo } from "@/lib/repo-context";
import { usePulls, useDeleteRepo } from "@/lib/hooks";
import type { ConfirmOptions } from "@/components/confirm-dialog";
import { activeKeyFor, toShellRepo } from "../helpers";

interface ShellContextOptions {
  onOpenCommandPalette: () => void;
  /** From `useConfirm()` in AppShell, which renders the dialog. */
  confirm: (opts: ConfirmOptions, onConfirm: () => void) => void;
}

/**
 * Assembles the `ShellContext` consumed by AppFrame: active nav key, the repo
 * list/active repo (mapped to the shell shape), theme, PR count, and the repo
 * selection / add / removal actions.
 */
export function useShellContext({ onOpenCommandPalette, confirm }: ShellContextOptions): ShellContext {
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

  const onRemoveRepo = React.useCallback(
    (id: string) => {
      const target = repos.find((r) => r.id === id);
      confirm(
        {
          title: t("removeRepo.title"),
          body: t("removeRepo.confirm", { name: target?.full_name ?? t("removeRepo.fallbackName") }),
          confirmLabel: t("removeRepo.confirmLabel"),
        },
        () =>
          deleteRepo.mutate(id, {
            onSuccess: () => {
              if (repoId === id) {
                const next = repos.find((r) => r.id !== id);
                router.push(next ? `/repos/${next.id}/pulls` : "/onboarding");
              }
            },
          }),
      );
    },
    [repos, repoId, t, deleteRepo, router, confirm],
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
