/* /skills — Skills Lab: card grid + side preview (?skill=<id>). Suspense is
   required around useSearchParams on a statically rendered route. */
import React from "react";
import { SkillsView } from "./_components/SkillsView";

export default function SkillsPage() {
  return (
    <React.Suspense fallback={null}>
      <SkillsView />
    </React.Suspense>
  );
}
