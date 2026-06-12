import { SharedDigestView } from "./_components/SharedDigestView";

/* Route: /share/:token — public, unauthenticated read view for a shared digest.
   Thin route entry; the view + styles are colocated under _components. */
export default async function SharedDigestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedDigestView token={token} />;
}
