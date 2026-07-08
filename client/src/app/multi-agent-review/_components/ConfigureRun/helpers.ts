import type { Agent } from "@devdigest/shared";

/** Default selection (OQ-4): every enabled agent pre-checked, no persistence
    between sessions. Merges newly-seen agents into "checked" without
    clobbering a selection the user already made this session. */
export function withDefaultsChecked(
  enabledAgents: Agent[],
  prev: Record<string, boolean>,
): Record<string, boolean> {
  let changed = false;
  const next = { ...prev };
  for (const a of enabledAgents) {
    if (!(a.id in next)) {
      next[a.id] = true;
      changed = true;
    }
  }
  return changed ? next : prev;
}
