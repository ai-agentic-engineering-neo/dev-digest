import { OnboardingTourView } from "./_components/OnboardingTourView";

/* Route: /repos/:repoId/tour — thin route entry. D10/AC-39: the path
   segment is "tour", never "onboarding". The screen, its sections,
   provenance/status display and helpers are colocated under
   _components/OnboardingTourView. */
export default function TourPage() {
  return <OnboardingTourView />;
}
