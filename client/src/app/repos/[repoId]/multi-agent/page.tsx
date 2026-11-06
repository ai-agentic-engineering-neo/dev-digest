import { Suspense } from "react";
import { MultiAgentView } from "./_components/MultiAgentView";

/* Route: /repos/:repoId/multi-agent (Multi-Agent Review). Thin server entry — the whole
   screen lives in _components/MultiAgentView. Suspense: it reads the URL via useSearchParams. */
export default async function MultiAgentPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  return (
    <Suspense>
      <MultiAgentView repoId={repoId} />
    </Suspense>
  );
}
