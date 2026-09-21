import { PrDetailView } from "./_components/PrDetailView";

/* Route: /repos/:repoId/pulls/:number — thin route entry. The detail screen,
   its tabs, trace drawer and styles are colocated under _components/PrDetailView. */
export default function PRDetailPage() {
  return <PrDetailView />;
}
