import { Suspense } from "react";
import { SkillsLab } from "./_components/SkillsLab";

/* Route: /skills (Skills Lab → Skills). Thin route entry — the master-detail view
   (list + Config / Preview / Evals / Stats / Versions) lives in _components/SkillsLab.
   Suspense: SkillsLab reads ?id / ?tab via useSearchParams. */
export default function SkillsPage() {
  return (
    <Suspense>
      <SkillsLab />
    </Suspense>
  );
}
