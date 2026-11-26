import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SkillsView } from "./_components/SkillsView";

/* Route: /skills (skill list + "Select a skill" pane). Thin server entry; the
   client view lives in _components/SkillsView. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("skills") };
}

export default function SkillsPage() {
  return <SkillsView />;
}
