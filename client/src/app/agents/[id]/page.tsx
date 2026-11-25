import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgentEditorView } from "./_components/AgentEditorView";

/* Route: /agents/:id (agent editor). Thin server entry; the client view
   (agent list + editor, ?tab=) lives in _components/AgentEditorView. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("agent") };
}

export default function AgentEditorPage() {
  return <AgentEditorView />;
}
