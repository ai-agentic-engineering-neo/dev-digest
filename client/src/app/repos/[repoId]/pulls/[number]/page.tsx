/* PR Detail — /repos/:repoId/pulls/:number. Thin route: awaits the params and
   renders the client PrDetailView (data is client-fetched through TanStack). */
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PrDetailView } from "./_components/PrDetailView";

interface PrDetailPageProps {
  params: Promise<{ repoId: string; number: string }>;
}

export async function generateMetadata({ params }: PrDetailPageProps): Promise<Metadata> {
  const [{ number }, t] = await Promise.all([params, getTranslations("prReview")]);
  return { title: t("detail.metaTitle", { number }) };
}

export default async function PrDetailPage({ params }: PrDetailPageProps) {
  const { repoId, number } = await params;
  return <PrDetailView repoId={repoId} number={number} />;
}
