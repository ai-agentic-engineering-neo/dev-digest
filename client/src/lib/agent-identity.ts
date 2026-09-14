import type { IconName } from "@devdigest/ui";

/**
 * specs/13-multi-agent-review.md D21 — derived visual identity: a PURE hash
 * from an agent id into a fixed {color, icon} pair. No schema field, no
 * stored value (N14) — the same agent renders identically on every surface
 * (configure, results columns/tabs, and the PR-page picker) and across
 * reloads, because the input (`agent_id`) never changes.
 *
 * Promoted here (from `multi-agent/[prId]/_components/MultiAgentResultsView/
 * helpers.ts`) on its second consumer — `MultiAgentConfigureView` (a sibling
 * route) needs the identical palette/hash, and a cross-route deep import into
 * another route's private `_components` internals is not a legitimate way to
 * share it. `client/LEARNINGS.md`'s `diff-viewer` entry: "promote on second
 * consumer".
 */
const IDENTITY_PALETTE: ReadonlyArray<{ color: string; icon: IconName }> = [
  { color: "#3b82f6", icon: "Cpu" },
  { color: "#10b981", icon: "Zap" },
  { color: "#f59e0b", icon: "Bug" },
  { color: "#8b5cf6", icon: "Shield" },
  { color: "#ec4899", icon: "Target" },
  { color: "#14b8a6", icon: "Gauge" },
  { color: "#f43f5e", icon: "Boxes" },
  { color: "#6366f1", icon: "Activity" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export interface AgentIdentity {
  color: string;
  icon: IconName;
}

export function agentIdentity(agentId: string): AgentIdentity {
  return IDENTITY_PALETTE[hashString(agentId) % IDENTITY_PALETTE.length]!;
}
