/* Route: /repos/:repoId/pulls (PR list). Thin entry — the screen lives in
   _components/PullsListView. */
"use client";

import { useParams } from "next/navigation";
import { PullsListView } from "./_components/PullsListView";

export default function PullsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <PullsListView repoId={repoId} />;
}
