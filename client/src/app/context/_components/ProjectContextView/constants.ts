import type { IconName } from "@devdigest/ui";

/** URL search param that keeps the selected document across a reload. The
    repository is not in the URL: it is the shell's active repository. */
export const DOC_PARAM = "doc";

/** How the opened document is shown: rendered Markdown, or its raw source. */
export const DOC_MODES = ["preview", "edit"] as const;
export type DocMode = (typeof DOC_MODES)[number];

/** Toolbar icons from the design that have no backend yet; rendered disabled. */
export const PLANNED_TOOLS: ReadonlyArray<{ key: "add" | "folder" | "upload"; icon: IconName }> = [
  { key: "add", icon: "Plus" },
  { key: "folder", icon: "Folder" },
  { key: "upload", icon: "Upload" },
];
