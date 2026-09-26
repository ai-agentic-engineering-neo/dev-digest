import type { Skill } from "@devdigest/shared";

/** An imported skill that is still disabled has not been vetted yet (foreign instructions in the prompt). */
export const needsVetting = (sk: Skill): boolean => sk.source !== "manual" && !sk.enabled;
