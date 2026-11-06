export type MultiAgentPhase = "config" | "results";
export type MultiAgentViewMode = "columns" | "tabs";

export interface MultiAgentUrlState {
  /** PR number (positive int), else null. */
  pr: number | null;
  /** null = param absent (default selection); [] = explicitly none. */
  agents: string[] | null;
  phase: MultiAgentPhase;
  view: MultiAgentViewMode;
}

export function parseMultiAgentSearch(sp: { get(name: string): string | null }): MultiAgentUrlState {
  const prRaw = sp.get("pr");
  const prNum = prRaw !== null && /^\d+$/.test(prRaw.trim()) ? Number(prRaw.trim()) : null;

  const agentsRaw = sp.get("agents");
  const agents =
    agentsRaw === null
      ? null
      : [...new Set(agentsRaw.split(",").map((a) => a.trim()).filter((a) => a !== ""))];

  return {
    pr: prNum !== null && prNum > 0 ? prNum : null,
    agents,
    phase: sp.get("phase") === "results" ? "results" : "config",
    view: sp.get("view") === "tabs" ? "tabs" : "columns",
  };
}

export function multiAgentHref(repoId: string, state: Partial<MultiAgentUrlState>): string {
  const base = `/repos/${encodeURIComponent(repoId)}/multi-agent`;
  const parts: string[] = [];
  if (state.pr != null) parts.push(`pr=${encodeURIComponent(String(state.pr))}`);
  if (state.agents != null) parts.push(`agents=${state.agents.map(encodeURIComponent).join(",")}`);
  if (state.phase != null && state.phase !== "config") parts.push(`phase=${state.phase}`);
  if (state.view != null && state.view !== "columns") parts.push(`view=${state.view}`);
  return parts.length > 0 ? `${base}?${parts.join("&")}` : base;
}
