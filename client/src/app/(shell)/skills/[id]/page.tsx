import { SkillsView } from "../_components/SkillsView";

/* Route: /skills/:id (Skills library, with a selected skill). Same two-pane
   view as /skills — SkillsView reads the :id param itself. */
export default function SkillPage() {
  return <SkillsView />;
}
