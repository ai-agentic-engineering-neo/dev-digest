/** Pure helpers for AppShell. */

import type { RepoSummary } from "@devdigest/ui";
import type { Repo } from "../../lib/types";

/** Map a lib `Repo` to the `RepoSummary` shape the AppFrame shell context expects. */
export function toShellRepo(r: Repo): RepoSummary {
  return {
    id: r.id,
    full_name: r.full_name,
    default_branch: r.default_branch,
    syncedLabel: r.last_polled_at ? "synced" : "not synced",
  };
}

/** Whether an event target is a text-entry element (guards typing-aware shortcuts). */
export function isTextInput(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  return (
    !!node &&
    (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable)
  );
}

/** True when `seg` appears as its own path SEGMENT (split on "/"), not merely
 *  as a substring — e.g. `/repos/:id/tour` has the segment "tour", but
 *  `/onboarding` (the add-a-repo screen) does not. */
function hasSegment(pathname: string, seg: string): boolean {
  return pathname.split("/").includes(seg);
}

/** Derive the active sidebar key from the current pathname. */
export function activeKeyFor(pathname: string): string {
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.includes("/multi-agent")) return "multi-agent";
  // D10/AC-39: segment-exact, not `.includes("/onboarding")` — that substring
  // match also matched the unrelated `/onboarding` add-a-repo screen. The
  // tour route is `/repos/:repoId/tour`, no "onboarding" segment anywhere in
  // its URL.
  if (hasSegment(pathname, "tour")) return "onboarding-tour";
  if (pathname.includes("/context")) return "context";
  if (pathname.includes("/conventions")) return "conventions";
  if (pathname.includes("/pulls")) return "pulls";
  if (pathname.startsWith("/skills")) return "skills";
  if (pathname.startsWith("/agents")) return "agents";
  if (pathname.startsWith("/eval")) return "eval";
  if (pathname.startsWith("/memory")) return "memory";
  if (pathname.startsWith("/agent-performance")) return "agent-performance";
  if (pathname.startsWith("/ci-runs")) return "ci-runs";
  return "";
}
