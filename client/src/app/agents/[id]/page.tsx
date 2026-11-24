import { AgentDetailView } from "./_components/AgentDetailView";

/* Route: /agents/:id (Agent editor). Thin route entry — the view and its logic live in
   _components/AgentDetailView. */
export default function AgentEditorPage() {
  return <AgentDetailView />;
}
