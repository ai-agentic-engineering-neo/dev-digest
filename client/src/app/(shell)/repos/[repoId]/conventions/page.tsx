import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions. Thin route entry — the view lives in
   _components/ConventionsView. Guarded by the parent repos/[repoId]/layout.tsx. */
export default function ConventionsPage() {
  return <ConventionsView />;
}
