import type { OnboardingView } from "@devdigest/shared";
import { SECTIONS } from "./constants";

export type TourState = "loading" | "error" | "notFound" | "notCloned" | "empty" | "generating" | "tour";

/**
 * Which screen to show. A stored tour wins over "not cloned" (the tour stays
 * readable when the clone is gone); a running run without a tour is
 * "generating"; a failed run without a tour falls back to the empty state.
 */
export function viewState(input: {
  repoNotFound: boolean;
  isLoading: boolean;
  isError: boolean;
  view: OnboardingView | undefined;
  cloned: boolean;
}): TourState {
  if (input.repoNotFound) return "notFound";
  if (input.isLoading) return "loading";
  if (input.isError || !input.view) return "error";
  if (input.view.tour) return "tour";
  if (input.view.run?.status === "running") return "generating";
  if (!input.cloned) return "notCloned";
  return "empty";
}

/** `#critical-paths` → "critical-paths"; anything that is not a section id → null. */
export function sectionFromHash(hash: string): string | null {
  const id = hash.replace(/^#/, "");
  return SECTIONS.some((s) => s.id === id) ? id : null;
}

/** "2h" → "2h ago"; "now" → "just now" (the caller supplies both phrases). */
export function refreshedWhen(rel: string, labels: { justNow: string; ago: (when: string) => string }): string {
  return rel === "now" ? labels.justNow : labels.ago(rel);
}
