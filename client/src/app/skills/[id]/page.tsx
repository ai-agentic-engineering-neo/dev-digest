/* /skills/:id — full skill editor: Config, Preview and Versioning tabs (?tab=). */
import { SkillEditor } from "./_components/SkillEditor";

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SkillEditor id={id} />;
}
