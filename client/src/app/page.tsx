import { HomeView } from "./_components/HomeView";

/* Route: / (home: redirect to the first repo or onboarding). Thin route entry — the view and its logic live in
   _components/HomeView. */
export default function HomePage() {
  return <HomeView />;
}
