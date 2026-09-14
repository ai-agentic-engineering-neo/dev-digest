export type CiTriggerEvent = "opened" | "synchronize" | "reopened";

/** D4/AC-1 — fixed step order; `ExportWizardSteps` renders these labels. */
export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;

/** AC-4 — opened + updated (synchronize) selected by default; reopened not. */
export const DEFAULT_TRIGGERS: CiTriggerEvent[] = ["opened", "synchronize"];

export const ALL_TRIGGERS: CiTriggerEvent[] = ["opened", "synchronize", "reopened"];
