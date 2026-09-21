import type { Agent } from "@devdigest/shared";

/** Case-insensitive filter over an agent's name + description. */
export function filterAgents<T extends Agent>(agents: T[], search: string): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return agents;
  return agents.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(q));
}
