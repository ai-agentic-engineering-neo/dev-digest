import { AgentEditorView } from "./_components/AgentEditorView";

/* Route: /agents/:id — thin route entry. The editor screen, its tabs, styles
   and constants are colocated under _components/AgentEditorView. */
export default function AgentEditorPage() {
  return <AgentEditorView />;
}
