import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SkillDetailView } from "../_components/SkillDetailView";

/* Route: /skills/:id?tab=config|preview|stats|versions. One skill, full width; the
   tab is read from ?tab= on the client. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("skill") };
}

export default async function SkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SkillDetailView skillId={id} />;
}
