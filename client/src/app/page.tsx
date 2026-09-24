import { HomeView } from "./_components/HomeView";

/* Route: / — thin entry. HomeView redirects to the first repo's PR list, or
   offers onboarding when there are no repos yet. */
export default function HomePage() {
  return <HomeView />;
}
