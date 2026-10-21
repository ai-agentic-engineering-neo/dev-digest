/* Onboarding tour — /repos/:repoId/tour. Thin server entry; the view is a client component. */
import { OnboardingTourView } from "./_components/OnboardingTourView";

export default async function TourPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  return <OnboardingTourView repoId={repoId} />;
}
