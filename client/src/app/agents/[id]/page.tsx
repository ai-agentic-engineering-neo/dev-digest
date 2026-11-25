/* Route: /agents/:id (Agent Editor). Thin entry — the screen lives in
   _components/AgentEditorView. */
"use client";

import { useParams } from "next/navigation";
import { AgentEditorView } from "./_components/AgentEditorView";

export default function AgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <AgentEditorView id={id} />;
}
