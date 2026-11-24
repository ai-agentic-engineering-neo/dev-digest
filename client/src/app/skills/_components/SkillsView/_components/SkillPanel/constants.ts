import type { IconName } from "@devdigest/ui";

export type PanelTab = "config" | "preview" | "versioning";

export interface TabDef {
  key: PanelTab;
  labelKey: string;
  icon: IconName;
}

/** Stats arrives later; add it here (and a tab body) when it exists. */
export const TABS: TabDef[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "versioning", labelKey: "detail.tabs.versioning", icon: "History" },
];

export const DEFAULT_TAB: PanelTab = "config";
