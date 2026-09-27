import { Suspense } from "react";
import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (Skills Lab). Thin route entry — the scan
   controls, the candidate cards and the create-skill modal live under
   _components/. */
export default function ConventionsPage() {
  return (
    <Suspense>
      <ConventionsView />
    </Suspense>
  );
}
