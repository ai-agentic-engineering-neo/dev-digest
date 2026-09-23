/* Pure selection logic for the Run Review agent picker — no React, no hooks,
   so every rule below is unit-testable on its own. */

/** The slice of an Agent this picker actually needs (keeps tests cheap). */
export interface SelectableAgent {
  id: string;
  enabled: boolean;
}

/**
 * What is ticked when the menu opens: the enabled agents.
 *
 * This is what keeps "run everything" a single click even though the old
 * one-click "Run all enabled agents" row is gone — the default selection IS
 * that row, expressed as checkboxes the user can now narrow.
 */
export function defaultSelection(agents: readonly SelectableAgent[]): string[] {
  return agents.filter((a) => a.enabled).map((a) => a.id);
}

/** Tick/untick one agent, preserving the order the rest were picked in. */
export function toggleAgent(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

/**
 * "Select all" takes EVERY agent, including disabled ones — an explicit pick
 * runs an agent regardless of its enabled flag, so the control means what it
 * says rather than quietly skipping rows the user can see ticked boxes for.
 */
export function selectAll(agents: readonly SelectableAgent[]): string[] {
  return agents.map((a) => a.id);
}

/** True when every visible agent is ticked — drives the Select all / Clear swap. */
export function isAllSelected(
  agents: readonly SelectableAgent[],
  selected: readonly string[],
): boolean {
  return agents.length > 0 && agents.every((a) => selected.includes(a.id));
}

/**
 * Which i18n key + values the footer button should render.
 *
 * One agent is named outright ("Run Security Reviewer") because at that point
 * the count adds nothing the user can't already see ticked; two or more fall
 * back to the count.
 */
export function runLabel(
  agents: readonly (SelectableAgent & { name: string })[],
  selected: readonly string[],
): { key: "runNone" | "runOne" | "runMany"; values: { name?: string; count?: number } } {
  if (selected.length === 0) return { key: "runNone", values: {} };
  if (selected.length === 1) {
    const only = agents.find((a) => a.id === selected[0]);
    // An id with no matching agent (stale selection after a delete) still has
    // to render something sane, so fall through to the count form.
    if (only) return { key: "runOne", values: { name: only.name } };
  }
  return { key: "runMany", values: { count: selected.length } };
}
