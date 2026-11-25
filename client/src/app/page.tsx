/* Route: / (root). Thin entry — redirect logic lives in _components/HomeView. */
import { HomeView } from "./_components/HomeView";

export default function HomePage() {
  return <HomeView />;
}
