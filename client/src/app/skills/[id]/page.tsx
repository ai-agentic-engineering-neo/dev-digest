/* /skills/:id — the same grid with the selected skill open in the side panel. */
import { SkillsView } from "../_components/SkillsView";

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SkillsView selectedId={id} />;
}
