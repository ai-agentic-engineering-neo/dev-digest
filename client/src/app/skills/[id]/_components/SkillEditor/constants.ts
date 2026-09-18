import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs. Parent 2.0 ships Config + Preview; Versions mounts in 3.0. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];

export const VALID_TABS = TABS.map((tb) => tb.key);
