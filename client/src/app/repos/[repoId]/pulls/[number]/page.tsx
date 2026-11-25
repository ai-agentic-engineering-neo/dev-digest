/* Route: /repos/:repoId/pulls/:number (PR detail). Thin entry — the screen
   lives in _components/PrDetailView. */
"use client";

import { useParams } from "next/navigation";
import { PrDetailView } from "./_components/PrDetailView";

export default function PRDetailPage() {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  return <PrDetailView repoId={repoId} number={number} />;
}
