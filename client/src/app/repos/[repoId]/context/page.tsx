"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context (Workspace → Project Context). Thin route entry — the doc list,
   filter and preview live in _components/ProjectContextView. Suspense: the view reads ?path=
   via useSearchParams. */
export default function ProjectContextPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return (
    <Suspense>
      <ProjectContextView repoId={repoId} />
    </Suspense>
  );
}
