/* Add-repository route — /onboarding. Thin wrapper; the screen lives in
   _components/AddRepoView (which owns its own "use client" boundary). */
import { AddRepoView } from "./_components/AddRepoView";

export default function AddRepoPage() {
  return <AddRepoView />;
}
