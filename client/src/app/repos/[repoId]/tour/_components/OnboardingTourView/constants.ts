import type { IconName } from "@devdigest/ui";
import type { OnboardingSectionKind, OnboardingStatus } from "@devdigest/shared";

/**
 * Icon + accent per tour status — the visual companion to `StatusBanner`'s
 * `role="status" aria-live="polite"` text (AC-45). Every `OnboardingStatus`
 * value is covered so a new status can't silently fall through to nothing.
 */
export const STATUS_META: Record<OnboardingStatus, { icon: IconName; color: string; bg: string }> = {
  generated: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  stale: { icon: "Clock", color: "var(--warn)", bg: "var(--warn-bg)" },
  skeleton: { icon: "Info", color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  degraded: { icon: "AlertTriangle", color: "var(--warn)", bg: "var(--warn-bg)" },
  empty: { icon: "Info", color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  generating: { icon: "RefreshCw", color: "var(--info)", bg: "var(--info-bg)" },
  failed: { icon: "AlertOctagon", color: "var(--crit)", bg: "var(--crit-bg)" },
  refused: { icon: "AlertTriangle", color: "var(--warn)", bg: "var(--warn-bg)" },
};

/** Purely decorative per-section icon — the section's own title text (AC-40's
 *  table of contents) is what actually identifies it. */
export const SECTION_ICON: Record<OnboardingSectionKind, IconName> = {
  architecture: "Layers",
  critical_paths: "GitBranch",
  run_locally: "Play",
  reading_path: "FileText",
  first_tasks: "CheckCircle",
};
