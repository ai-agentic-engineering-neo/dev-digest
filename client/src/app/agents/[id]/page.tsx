import type { Metadata } from "next";
import { AgentEditorView, resolveTab } from "./_components/AgentEditorView";

export const metadata: Metadata = { title: "Agent" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

/* Route: /agents/:id — Agent Editor. Thin entry: resolves the id and ?tab=,
   the screen lives in _components/AgentEditorView. */
export default async function AgentEditorPage({ params, searchParams }: Props) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  return <AgentEditorView id={id} tab={resolveTab(tab)} />;
}
