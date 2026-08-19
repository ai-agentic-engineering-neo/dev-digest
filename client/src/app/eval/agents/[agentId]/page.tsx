import { EvalAgentDetailView } from "./_components/EvalAgentDetailView";

/* Route: /eval/agents/:agentId — thin route entry. One agent's eval detail
   (specs/12-eval-pipeline.md, AC-44/AC-45/AC-48). The screen, its tiles,
   trend, run history and compare modal are colocated under
   _components/EvalAgentDetailView. */
export default function EvalAgentDetailPage() {
  return <EvalAgentDetailView />;
}
