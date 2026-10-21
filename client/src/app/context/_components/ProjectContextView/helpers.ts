/** The directory every listed path shares, with a trailing slash ("" when none or a single root-level file). */
export function commonFolder(paths: readonly string[]): string {
  if (paths.length === 0) return "";
  const dirs = paths.map((p) => p.slice(0, p.lastIndexOf("/") + 1));
  let prefix = dirs[0] ?? "";
  for (const d of dirs) {
    while (prefix && !d.startsWith(prefix)) prefix = prefix.slice(0, prefix.lastIndexOf("/", prefix.length - 2) + 1);
    if (!prefix) break;
  }
  return prefix;
}

/** The path shown in a row or the pane header: relative to the shared folder. */
export function displayName(path: string, folder: string): string {
  return folder && path.startsWith(folder) ? path.slice(folder.length) : path;
}

/** Share of enabled agents that use the opened document, 0–100; 0 when there is no enabled agent. */
export function coveragePercent(agentsUsing: number, enabledAgents: number): number {
  if (enabledAgents <= 0) return 0;
  return Math.min(100, Math.round((100 * agentsUsing) / enabledAgents));
}

/** Where the page URL points after the selected document changes. */
export function pageHref(params: URLSearchParams, patch: Record<string, string | null>): string {
  const sp = new URLSearchParams(params.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) sp.delete(key);
    else sp.set(key, value);
  }
  const qs = sp.toString();
  return qs ? `/context?${qs}` : "/context";
}
