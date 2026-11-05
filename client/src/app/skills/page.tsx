import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills Lab → Skills). Thin route entry — the grid, preview
   drawer, editor and import modals are colocated under _components/SkillsListView. */
export default function SkillsPage() {
  return <SkillsListView />;
}
