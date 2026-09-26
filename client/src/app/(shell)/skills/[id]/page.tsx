import { SkillsView } from "../_components/SkillsView";

/* Route: /skills/:id (skill detail — Config/Preview/Stats/Versions tabs).
   Thin route entry — params are resolved in the view. */
export default function SkillDetailPage() {
  return <SkillsView />;
}
