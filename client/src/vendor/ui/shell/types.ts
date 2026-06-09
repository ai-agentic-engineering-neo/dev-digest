import type React from "react";

/** Minimal Link contract — Next's <Link> satisfies this. */
export type LinkLike = React.ComponentType<{
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  onClick?: () => void;
}>;

export interface RepoSummary {
  id: string;
  full_name: string;
  default_branch?: string;
  syncedLabel?: string;
}

export interface ShellContext {
  Link?: LinkLike;
  /** Active nav key (e.g. "pulls"). */
  activeKey?: string;
  /** Active repo id, used to fill :repoId in hrefs. */
  repoId?: string | null;
  repos?: RepoSummary[];
  activeRepo?: RepoSummary | null;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
  onOpenCommandPalette?: () => void;
  onSelectRepo?: (id: string) => void;
  /** Invoked when the user picks "Add repository…" in the repo switcher. */
  onAddRepo?: () => void;
  /** Invoked when the user removes a repo via the trash action in the switcher. */
  onRemoveRepo?: (id: string) => void;
  onRefresh?: () => void;
  prCount?: number;
}

export interface Crumb {
  label: string;
  mono?: boolean;
  href?: string;
}
