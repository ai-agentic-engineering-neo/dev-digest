import { Suspense } from "react";
import { SkillsShell } from "./_components/SkillsShell";

/* Layout for /skills and /skills/:id. The skill LIST lives here, not in a page:
   a layout survives navigation between its child routes, so moving from one
   skill to the next keeps the list mounted — its search box and scroll position
   included — while the right-hand pane, the page, swaps.

   The Suspense boundary is what keeps these routes prerenderable: the shell and
   the pages read `useSearchParams()`. */
export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <SkillsShell>{children}</SkillsShell>
    </Suspense>
  );
}
