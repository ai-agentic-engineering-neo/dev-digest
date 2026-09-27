import { SkillsIndex } from "./_components/SkillsIndex";

/* Route: /skills — the list (from the layout) with nothing selected. Also the
   landing point of the old `/skills?skill=<id>` links, which it forwards. */
export default function SkillsPage() {
  return <SkillsIndex />;
}
