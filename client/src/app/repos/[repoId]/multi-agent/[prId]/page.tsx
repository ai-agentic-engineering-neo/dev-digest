import { MultiAgentResultsView } from "./_components/MultiAgentResultsView";

/* Route: /repos/:repoId/multi-agent/:prId — thin route entry. Screens C/D
   (columns/tabs + conflicts) and the per-agent trace drawer are colocated
   under _components/MultiAgentResultsView. */
export default function MultiAgentResultsPage() {
  return <MultiAgentResultsView />;
}
