import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotFoundView } from "./_components/NotFoundView";

/* Root 404 (Next.js `not-found.tsx`): unknown URLs get a real 404 status and a
   way back, instead of the framework's bare default page. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return { title: t("notFound.title") };
}

export default function NotFound() {
  return <NotFoundView />;
}
