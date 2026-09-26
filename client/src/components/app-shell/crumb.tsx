"use client";

import React from "react";
import type { Crumb } from "@devdigest/ui";

type SetCrumb = (crumb: Crumb[] | undefined) => void;

const CrumbContext = React.createContext<SetCrumb | null>(null);

/** Holds the breadcrumb the shell's top bar shows. The shell lives in a layout
   and stays mounted across navigations, so each view declares its crumb with
   `useCrumb` instead of passing it to a per-page `<AppShell>`. */
export function CrumbProvider({
  children,
  onChange,
}: {
  children: React.ReactNode;
  onChange: SetCrumb;
}) {
  return <CrumbContext.Provider value={onChange}>{children}</CrumbContext.Provider>;
}

/** Declare the current view's breadcrumb; cleared again when the view unmounts.
   Keyed on the serialised crumb, so an inline array literal does not loop. */
export function useCrumb(crumb: Crumb[]): void {
  const set = React.useContext(CrumbContext);
  const key = JSON.stringify(crumb);
  // Layout effect: set before paint so the top bar never flashes empty.
  React.useLayoutEffect(() => {
    set?.(JSON.parse(key) as Crumb[]);
    return () => set?.(undefined);
  }, [set, key]);
}
