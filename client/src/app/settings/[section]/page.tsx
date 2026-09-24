import type { Metadata } from "next";
import { SettingsView } from "./_components/SettingsView";

export const metadata: Metadata = { title: "Settings" };

type Props = { params: Promise<{ section: string }> };

/* Route: /settings/:section. Thin route entry — the view, its section panels,
   styles, constants and i18n are colocated under _components/SettingsView. */
export default async function SettingsPage({ params }: Props) {
  const { section } = await params;
  return <SettingsView section={section} />;
}
