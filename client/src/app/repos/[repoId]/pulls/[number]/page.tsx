import { PrDetailView } from "./_components/PrDetailView";

/* Route: /repos/:repoId/pulls/:number (PR detail). Thin route entry — the view and its logic live in
   _components/PrDetailView. */
export default function PRDetailPage() {
  return <PrDetailView />;
}
