/* /context — Project Context: the Markdown documents of a repository that agents
   and skills can attach as grounding context (SPEC-01). */
import { Suspense } from "react";
import { ProjectContextView } from "./_components/ProjectContextView";

export default function ProjectContextPage() {
  // the view reads ?repo= and ?doc= with useSearchParams, which needs a Suspense boundary
  return (
    <Suspense fallback={null}>
      <ProjectContextView />
    </Suspense>
  );
}
