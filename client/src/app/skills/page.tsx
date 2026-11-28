import { SkillsView } from "./_components/SkillsView";

/* Route: /skills (Skills list, nothing selected). Thin route entry — the
   master-detail view lives under _components/SkillsView. */
export default function SkillsPage() {
  return <SkillsView />;
}
