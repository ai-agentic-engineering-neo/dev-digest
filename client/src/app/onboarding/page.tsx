/* Add-repository route — /onboarding. Thin wrapper; the screen (a client
   component) lives in _components/AddRepoView. */
import { AddRepoView } from "./_components/AddRepoView";

export default function AddRepoPage() {
  return <AddRepoView />;
}
