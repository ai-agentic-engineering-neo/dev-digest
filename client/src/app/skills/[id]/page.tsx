import { SkillsView } from "../_components/SkillsView";

/* Route: /skills/:id (Skill editor, tab in ?tab=). Same master-detail view as
   /skills, with the skill selected. */
export default function SkillEditorPage() {
  return <SkillsView />;
}
