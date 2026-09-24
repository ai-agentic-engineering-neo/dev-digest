import type { Metadata } from "next";
import { PullsView, parsePullsSearch } from "./_components/PullsView";

export const metadata: Metadata = { title: "Pull requests" };

type Props = {
  params: Promise<{ repoId: string }>;
  searchParams: Promise<{ status?: string | string[]; sort?: string | string[] }>;
};

/* Route: /repos/:repoId/pulls — PR list. Thin entry: resolves the repo id and
   ?status&sort, the screen lives in _components/PullsView. */
export default async function PullsPage({ params, searchParams }: Props) {
  const [{ repoId }, search] = await Promise.all([params, searchParams]);
  return <PullsView repoId={repoId} {...parsePullsSearch(search)} />;
}
