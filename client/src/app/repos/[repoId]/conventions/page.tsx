import type { Metadata } from "next";
import { ConventionsView } from "./_components/ConventionsView";

export const metadata: Metadata = { title: "Conventions" };

type Props = { params: Promise<{ repoId: string }> };

/* Route: /repos/:repoId/conventions — extracted house rules of a repo. Thin
   entry: resolves the repo id, the screen lives in _components/ConventionsView. */
export default async function ConventionsPage({ params }: Props) {
  const { repoId } = await params;
  return <ConventionsView repoId={repoId} />;
}
