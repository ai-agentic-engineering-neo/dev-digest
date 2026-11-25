import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PrDetailView } from "./_components/PrDetailView";

/* Route: /repos/:repoId/pulls/:number (PR detail). Thin server entry; the
   client view (tabs in ?tab, live runs, trace drawer) lives in
   _components/PrDetailView. The title needs only the URL param — no fetch. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ repoId: string; number: string }>;
}): Promise<Metadata> {
  const [{ number }, t] = await Promise.all([params, getTranslations("meta")]);
  return { title: t("pull", { number }) };
}

export default function PRDetailPage() {
  return <PrDetailView />;
}
