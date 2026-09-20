import { Suspense } from "react";
import { SkillsView } from "./_components/SkillsView";

/* Route: /skills (Skills library, no selection). Thin route entry — the view,
   its cards, editor, styles and i18n are colocated under _components/SkillsView.
   Suspense because the view reads ?tab= through useSearchParams: without a
   boundary the whole route falls back to client rendering. */
export default function SkillsPage() {
  return (
    <Suspense>
      <SkillsView />
    </Suspense>
  );
}
