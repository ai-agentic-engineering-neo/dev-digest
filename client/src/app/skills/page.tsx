import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (the skill library). Thin route entry — the view, its editor
   modal, import drawer, preview pane, styles and helpers are colocated under
   _components/. */
export default function SkillsPage() {
  return <SkillsListView />;
}
