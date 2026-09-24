import type { Metadata } from "next";
import { NotFoundView } from "./_components/NotFoundView";

export const metadata: Metadata = { title: "Not found" };

/* Root 404 — unknown URLs and notFound() calls without a closer boundary. */
export default function NotFound() {
  return <NotFoundView />;
}
