import { PrDetailView } from "./_components/PrDetailView";

/* Route: /repos/:repoId/pulls/:number (PR detail). Thin route entry — the view,
   its tabs and the run trace drawer live under _components. */
export default function PrDetailPage() {
  return <PrDetailView />;
}
