import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PullsView } from "./_components/PullsView";

/* Route: /repos/:repoId/pulls (PR list). Thin server entry; the client view
   (filters in the query string, refresh, rows) lives in _components/PullsView. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("pulls") };
}

export default function PullsPage() {
  return <PullsView />;
}
