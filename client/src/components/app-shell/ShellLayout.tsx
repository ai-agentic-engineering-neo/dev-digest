/* ShellLayout — the app shell as a layout: mounted once per route group, so
   navigating between pages no longer remounts the sidebar, top bar and global
   shortcuts. Views set the breadcrumb through `useCrumb`. */
"use client";

import React from "react";
import type { Crumb } from "@devdigest/ui";
import { AppShell } from "./AppShell";
import { CrumbProvider } from "./crumb";

export function ShellLayout({ children }: { children: React.ReactNode }) {
  const [crumb, setCrumb] = React.useState<Crumb[] | undefined>(undefined);
  return (
    <CrumbProvider onChange={setCrumb}>
      <AppShell crumb={crumb}>{children}</AppShell>
    </CrumbProvider>
  );
}
