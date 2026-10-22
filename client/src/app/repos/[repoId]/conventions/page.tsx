/* Conventions — /repos/:repoId/conventions (L02). Scan the repo for house rules,
   accept/reject them, and merge the accepted ones into a skill. */
"use client";

import { useParams } from "next/navigation";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ConventionsView repoId={repoId} />;
}
