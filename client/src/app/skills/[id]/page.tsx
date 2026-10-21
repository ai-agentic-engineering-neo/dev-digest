/* /skills/:id — the editor now lives inline on /skills (master-detail), so an
   old link lands on the same skill there, keeping its ?tab=. */
import { redirect } from "next/navigation";

export default async function SkillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const sp = new URLSearchParams({ skill: id });
  if (tab) sp.set("tab", tab);
  redirect(`/skills?${sp.toString()}`);
}
