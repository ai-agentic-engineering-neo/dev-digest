import type { Metadata } from "next";
import { SkillsView } from "./_components/SkillsView";

/* Route: /skills — thin route entry. The master-detail screen, its rail, editor
   tabs, styles, constants and helpers are colocated under _components/SkillsView. */
export const metadata: Metadata = { title: "Skills — DevDigest" };

export default function SkillsPage() {
  return <SkillsView />;
}
