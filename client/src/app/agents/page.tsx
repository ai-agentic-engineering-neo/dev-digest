import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgentsListView } from "./_components/AgentsListView";

/* Route: /agents (Agents list). Thin route entry — the view, its create modal,
   styles, constants, helpers and i18n are colocated under _components/AgentsListView. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("agents") };
}

export default function AgentsPage() {
  return <AgentsListView />;
}
