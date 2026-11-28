import type { SkillSource } from "@devdigest/shared";

/** Sources whose text came from someone else: the form repeats the trust warning. */
export const UNTRUSTED_SOURCES: readonly SkillSource[] = ["community", "imported_file", "imported_url"];
