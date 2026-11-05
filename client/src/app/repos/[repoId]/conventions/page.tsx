"use client";

import { useParams } from "next/navigation";
import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (Skills Lab → Conventions). Thin route entry —
   the candidate list and the "Create skill from conventions" modal are colocated
   under _components/ConventionsView. */
export default function ConventionsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ConventionsView repoId={repoId} />;
}
