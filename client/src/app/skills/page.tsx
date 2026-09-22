import type { Metadata } from "next";
import { SkillsView } from "./_components/SkillsView";
import { resolvePreviewId } from "./helpers";

export const metadata: Metadata = { title: "Skills" };

type Props = { searchParams: Promise<{ preview?: string | string[] }> };

/* Route: /skills — skill grid. Thin entry: resolves ?preview= (the side
   drawer), the screen lives in _components/SkillsView. */
export default async function SkillsPage({ searchParams }: Props) {
  const { preview } = await searchParams;
  return <SkillsView previewId={resolvePreviewId(preview)} />;
}
