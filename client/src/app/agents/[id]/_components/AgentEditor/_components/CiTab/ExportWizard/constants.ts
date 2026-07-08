import type { IconName } from "@devdigest/ui";
import type { CiTarget } from "@devdigest/shared";
import type { TriggerState } from "./types";

export const MODAL_WIDTH = 860;

/** GHA is preselected + badged "recommended" (AC-1, AC-2). */
export const RECOMMENDED_TARGET: CiTarget = "gha";

export const TARGET_OPTIONS: { id: CiTarget; icon: IconName }[] = [
  { id: "gha", icon: "Workflow" },
  { id: "circle", icon: "GitBranch" },
  { id: "jenkins", icon: "Wrench" },
  { id: "cli", icon: "Command" },
];

/** Trigger defaults: `opened` + `synchronize` on, `reopened` off. */
export const DEFAULT_TRIGGERS: TriggerState = {
  opened: true,
  synchronize: true,
  reopened: false,
};

export const DEFAULT_BASE = "main";
