import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (Conventions Extractor). Thin server entry;
   the client view lives in _components/ConventionsView. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("conventions") };
}

export default function ConventionsPage() {
  return <ConventionsView />;
}
