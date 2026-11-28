import { redirect } from "next/navigation";

/* Route: /settings — no section given, send to the default one
   (SettingsView's DEFAULT_SECTION). */
export default function SettingsIndexPage() {
  redirect("/settings/api-keys");
}
