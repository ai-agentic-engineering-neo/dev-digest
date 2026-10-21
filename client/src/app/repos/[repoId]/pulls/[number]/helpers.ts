/** Route-level pure helpers for the PR detail page. */

/** Search string that opens Files changed at a path and optional line; other params are kept. */
export function diffDeepLinkSearch(current: URLSearchParams, path: string, line: number | null): string {
  const sp = new URLSearchParams(current.toString());
  sp.set("tab", "diff");
  sp.set("file", path);
  if (line == null) sp.delete("line");
  else sp.set("line", String(line));
  return sp.toString();
}
