import { HomeView } from "./_components/HomeView";

/* Route: / — sends the user to the first repo's PR list, or onboarding if no
   repos. Thin server entry; the client view lives in _components/HomeView.
   Title: the root default ("DevDigest"). */
export default function HomePage() {
  return <HomeView />;
}
