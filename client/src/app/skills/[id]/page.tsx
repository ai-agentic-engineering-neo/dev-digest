import type { Metadata } from "next";
import { resolveSkillTab } from "../helpers";
import { SkillEditorView } from "./_components/SkillEditorView";

export const metadata: Metadata = { title: "Skill" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

/* Route: /skills/:id — skill editor. Thin entry: resolves the id and ?tab=,
   the screen lives in _components/SkillEditorView. */
export default async function SkillEditorPage({ params, searchParams }: Props) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  return <SkillEditorView id={id} tab={resolveSkillTab(tab)} />;
}
