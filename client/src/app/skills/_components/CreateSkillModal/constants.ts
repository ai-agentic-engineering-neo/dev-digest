import type { ImportedSkillSource } from "@devdigest/shared";
import type { SkillFormValues } from "../helpers";

export const MODAL_WIDTH = 640;

export const EMPTY_FORM: SkillFormValues = { name: "", description: "", type: "custom", body: "" };

/** Tabs of the Add skill dialog, in order. */
export const ADD_SKILL_TABS = ["create", "file", "url"] as const;
export type AddSkillTab = (typeof ADD_SKILL_TABS)[number];

/** The `source` each import tab saves with (Create = typed in, no source). */
export const TAB_SOURCE: Record<AddSkillTab, ImportedSkillSource | undefined> = {
  create: undefined,
  file: "imported_file",
  url: "imported_url",
};

/** File import: what can be picked, and the read cap (mirrors `SkillBody` max). */
export const IMPORT_FILE_ACCEPT = ".md,.markdown,.txt,text/markdown,text/plain";
export const IMPORT_FILE_EXTENSIONS = /\.(md|markdown|txt)$/i;
export const IMPORT_NAME_MAX = 64;
export const IMPORT_DESCRIPTION_MAX = 200;
