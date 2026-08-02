import { PullsListView } from "./_components/PullsListView";

/* Route: /repos/:repoId/pulls — thin route entry. The list screen, its filter
   bar, rows, constants, styles and pure filter/sort helpers are colocated here. */
export default function PullsPage() {
  return <PullsListView />;
}
