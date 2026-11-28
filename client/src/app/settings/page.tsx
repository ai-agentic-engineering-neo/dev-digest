import { redirect } from "next/navigation";
import { DEFAULT_SECTION } from "./constants";

/* Route: /settings — no section given, send to the default one. */
export default function SettingsIndexPage() {
  redirect(`/settings/${DEFAULT_SECTION}`);
}
