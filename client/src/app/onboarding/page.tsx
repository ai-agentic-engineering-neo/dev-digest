import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AddRepoView } from "./_components/AddRepoView";

/* Add-repository route — /onboarding. Thin server entry; the screen lives in
   _components/AddRepoView (client). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("addRepo") };
}

export default function AddRepoPage() {
  return <AddRepoView />;
}
