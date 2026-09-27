import { SkillDetailPane } from "../_components/SkillDetailPane";

/* Route: /skills/:id — the same list (from the layout) with this skill open in
   the side panel. `?tab=` picks the tab, so "this skill, this tab" is one link. */
export default function SkillPage() {
  return <SkillDetailPane />;
}
