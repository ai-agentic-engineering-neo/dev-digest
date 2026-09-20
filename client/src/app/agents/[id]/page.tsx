/* Route: /agents/:id (Agent Editor). Thin route entry — the view and its
   styles/components are colocated under _components/AgentEditorView. */
import { AgentEditorView } from "./_components/AgentEditorView";

export default function AgentEditorPage() {
  return <AgentEditorView />;
}
