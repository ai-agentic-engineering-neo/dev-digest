import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SkillsView } from "./_components/SkillsView";
import { resolvePreviewId, skillHref } from "./helpers";

export const metadata: Metadata = { title: "Skills" };

type Props = { searchParams: Promise<{ preview?: string | string[] }> };

/* Route: /skills — skill grid. Thin entry: the screen lives in
   _components/SkillsView. The old preview drawer link (?preview=<id>) now
   redirects to that skill's editor. */
export default async function SkillsPage({ searchParams }: Props) {
  const previewId = resolvePreviewId((await searchParams).preview);
  if (previewId) redirect(skillHref(previewId));
  return <SkillsView />;
}
