/* crumb-context.tsx — the shell renders one breadcrumb trail; each page declares
   its own. The shell lives in the (shell) layout, above every page, so a page
   cannot pass crumbs down as props — it publishes them into this context and
   <AppShell> reads them. */
"use client";

import React from "react";
import type { Crumb } from "@devdigest/ui";

const CrumbCtx = React.createContext<{
  crumb: Crumb[];
  setCrumb: React.Dispatch<React.SetStateAction<Crumb[]>>;
}>({ crumb: [], setCrumb: () => {} });

export function CrumbProvider({ children }: { children: React.ReactNode }) {
  const [crumb, setCrumb] = React.useState<Crumb[]>([]);
  const value = React.useMemo(() => ({ crumb, setCrumb }), [crumb]);
  return <CrumbCtx.Provider value={value}>{children}</CrumbCtx.Provider>;
}

/** Read the current trail (used by the shell itself). */
export function useCrumb() {
  return React.useContext(CrumbCtx).crumb;
}

/**
 * Declare this page's breadcrumb trail. Renders nothing.
 *
 * `items` is usually a fresh array literal and often depends on data that
 * arrives later (`activeRepo?.full_name`, `agent?.name`), so the effect keys on
 * the serialized trail rather than array identity — otherwise it would loop on
 * every render.
 *
 * The cleanup clears the trail only when it is still this page's, because on
 * navigation the incoming page's effect can run before the outgoing page's
 * cleanup — an unconditional reset there wipes the crumbs that just arrived and
 * leaves the shell blank.
 */
export function ShellCrumb({ items }: { items: Crumb[] }) {
  const { setCrumb } = React.useContext(CrumbCtx);
  const key = JSON.stringify(items);
  React.useEffect(() => {
    setCrumb(JSON.parse(key) as Crumb[]);
    return () => setCrumb((prev) => (JSON.stringify(prev) === key ? [] : prev));
  }, [key, setCrumb]);
  return null;
}
