import { SkillsView } from "./_components/SkillsView";

/* Route: /skills (Skills library, no selection). Thin route entry — the view,
   its cards, editor, styles and i18n are colocated under _components/SkillsView. */
export default function SkillsPage() {
  return <SkillsView />;
}
