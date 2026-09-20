import { Suspense } from "react";
import { SkillsView } from "../_components/SkillsView";

/* Route: /skills/:id (Skills library, with a selected skill). Same two-pane
   view as /skills — SkillsView reads the :id param itself, and ?tab= through
   useSearchParams, which needs the boundary. */
export default function SkillPage() {
  return (
    <Suspense>
      <SkillsView />
    </Suspense>
  );
}
