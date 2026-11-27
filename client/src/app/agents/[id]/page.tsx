import { AgentEditorView } from "./_components/AgentEditorView";

/* Route: /agents/:id (Agent Editor). Thin route entry — the view, its tab
   constants and styles are colocated under _components/AgentEditorView. */
export default function AgentEditorPage() {
  return <AgentEditorView />;
}
