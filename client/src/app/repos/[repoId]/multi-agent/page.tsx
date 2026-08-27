import { MultiAgentConfigureView } from "./_components/MultiAgentConfigureView";

/* Route: /repos/:repoId/multi-agent — thin route entry. Screens A/B (pick a
   PR, pick agents, see estimates, run). Reads `?pr=<prId>` so every D26
   entrance can deep-link with a PR preselected. The screen, its agent rows
   and estimate math are colocated under _components/MultiAgentConfigureView. */
export default function MultiAgentConfigurePage() {
  return <MultiAgentConfigureView />;
}
