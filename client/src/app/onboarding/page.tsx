import { AddRepoView } from "./_components/AddRepoView";

/* Route: /onboarding — thin route entry. The screen lives in
   _components/AddRepoView, which owns the "use client" boundary. */
export default function AddRepoPage() {
  return <AddRepoView />;
}
