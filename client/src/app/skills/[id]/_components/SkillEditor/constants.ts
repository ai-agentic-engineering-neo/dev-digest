/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace;
    `mountOwner` marks a tab whose screen ships in a later lesson. */
export interface EditorTab {
  key: string;
  labelKey: string;
  mountOwner?: string;
}

/** Editor tabs (mockup order). Evals is a mount point for the L06 eval pipeline. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config" },
  { key: "preview", labelKey: "editor.tabs.preview" },
  { key: "evals", labelKey: "editor.tabs.evals", mountOwner: "L06 · Eval pipeline" },
  { key: "stats", labelKey: "editor.tabs.stats" },
  { key: "versions", labelKey: "editor.tabs.versions" },
];

export const TAB_KEYS = TABS.map((tb) => tb.key);
