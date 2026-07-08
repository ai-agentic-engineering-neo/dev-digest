import type { CiFile } from "@devdigest/shared";

export type WizardStep = 0 | 1 | 2 | 3;

export interface TriggerState {
  opened: boolean;
  synchronize: boolean;
  reopened: boolean;
}

export type PostAs = "github_review" | "pr_comment" | "none";

/** The four artifact categories shown on the Preview step. `workflow` is the
 *  only editable one (AC-3/AC-4) — the rest are generated read-only. */
export interface CategorizedFiles {
  manifest: CiFile | null;
  skills: CiFile[];
  memory: CiFile | null;
  workflow: CiFile | null;
}
