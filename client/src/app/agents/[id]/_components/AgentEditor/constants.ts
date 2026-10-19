/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace;
    `mountOwner` marks a tab whose screen ships in a later lesson. */
export interface EditorTab {
  key: string;
  labelKey: string;
  mountOwner?: string;
}

/** Editor tabs (mockup order). Evals / Stats / CI are mount points for later lessons. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config" },
  { key: "skills", labelKey: "editor.tabs.skills" },
  { key: "evals", labelKey: "editor.tabs.evals", mountOwner: "L06 · Eval pipeline" },
  { key: "stats", labelKey: "editor.tabs.stats", mountOwner: "L07 · per-agent stats" },
  { key: "ci", labelKey: "editor.tabs.ci", mountOwner: "L06 · Export to CI" },
];

export const TAB_KEYS = TABS.map((tb) => tb.key);
