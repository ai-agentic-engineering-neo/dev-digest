/* (shell) layout — every route that renders inside the app chrome lives in this
   group, so AppShell (breadcrumbs, command palette, shortcuts) mounts once and
   survives client-side navigation. `onboarding` sits outside the group because
   it renders without the shell. Route groups are URL-invisible: paths are
   unchanged. */
import { AppShell } from "@/components/app-shell";
import { CrumbProvider } from "@/components/app-shell/crumb-context";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <CrumbProvider>
      <AppShell>{children}</AppShell>
    </CrumbProvider>
  );
}
