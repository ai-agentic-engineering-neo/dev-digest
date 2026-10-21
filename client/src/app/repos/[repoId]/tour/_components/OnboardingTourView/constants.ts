import type { IconName } from "@devdigest/ui";

/**
 * The five sections, in page order. `kind` mirrors the contract's
 * `OnboardingSection['kind']` (a runtime import from @devdigest/shared breaks
 * the dev server, so the ids are mirrored here); `id` is the URL hash and the
 * card anchor.
 */
export const SECTIONS = [
  { kind: "architecture", id: "architecture", icon: "Workflow" },
  { kind: "critical_paths", id: "critical-paths", icon: "Activity" },
  { kind: "run_locally", id: "run-locally", icon: "Command" },
  { kind: "reading_path", id: "reading-path", icon: "ListChecks" },
  { kind: "first_tasks", id: "first-tasks", icon: "Target" },
] as const satisfies readonly { kind: string; id: string; icon: IconName }[];

export type SectionKind = (typeof SECTIONS)[number]["kind"];

export const SKELETON_CARDS = 3;
