import type { Metadata } from "next";
import { SkillsView } from "../_components/SkillsView";

/* Route: /skills/:id — thin route entry. Selection lives in the route, tab
   state in ?tab=; both are read by the view, not here. */
export const metadata: Metadata = { title: "Skills — DevDigest" };

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SkillsView selectedId={id} />;
}
