import type React from "react";
import { ShellLayout } from "@/components/app-shell";

/* Route group: no URL segment. Every screen that shows the app shell (sidebar,
   top bar, command palette) lives under here; /onboarding does not. */
export default function ShellGroupLayout({ children }: { children: React.ReactNode }) {
  return <ShellLayout>{children}</ShellLayout>;
}
