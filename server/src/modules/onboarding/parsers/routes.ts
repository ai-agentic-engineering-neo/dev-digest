/**
 * A3 — route/endpoint parsers for the repo analyzer.
 *
 * File-convention route detection (Next.js App/Pages routers, SvelteKit) plus
 * the regex grep patterns used to find backend verbs, Nest decorators and
 * react-router JSX literals. Pure string functions — no IO.
 */

/** Matches `app.get(...)`, `router.post(...)`, `fastify.put(...)`, etc. */
export const VERB_RE =
  /\b(?:app|router|fastify|server|api|route|r)\.(get|post|put|patch|delete|options|head)\s*(?:<[^>]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/gi;
/** Matches NestJS HTTP-method decorators: `@Get('/x')`, `@Post()`, etc. */
export const NEST_RE = /@(Get|Post|Put|Patch|Delete|All)\(\s*['"`]?([^'"`)]*)['"`]?\s*\)/g;
/** Matches react-router `<Route path="...">` literals. */
export const RR_JSX_RE = /<Route\b[^>]*\bpath\s*=\s*['"]([^'"]+)['"]/g;

/** Path segments after the last occurrence of `dir`, or null if absent. */
export function segmentsAfter(norm: string, dir: string): string[] | null {
  const parts = norm.split('/');
  const idx = parts.lastIndexOf(dir);
  if (idx === -1) return null;
  return parts.slice(idx + 1);
}

/** `[...slug]` → `*`, `[id]` → `:id`. */
export function dynamize(seg: string): string {
  return seg.replace(/^\[\.\.\.(.+)\]$/, '*').replace(/^\[(.+)\]$/, ':$1');
}

/** Join route segments into a normalized `/a/b` path. */
export function joinRoute(segs: string[]): string {
  const path = '/' + segs.filter(Boolean).join('/');
  return path === '/' ? '/' : path.replace(/\/+$/, '');
}

/** Next.js App Router: app/**\/page.tsx (UI) or route.ts (API). */
export function nextAppRoute(norm: string): { path: string; isApi: boolean } | null {
  const segs = segmentsAfter(norm, 'app');
  if (!segs || segs.length === 0) return null;
  const file = segs[segs.length - 1] ?? '';
  const kind = /^(page|route)\.[tj]sx?$/.exec(file);
  if (!kind) return null;
  const isApi = file.startsWith('route') || segs.includes('api');
  const routeSegs = segs
    .slice(0, -1)
    .filter((s) => !(s.startsWith('(') && s.endsWith(')'))) // route groups
    .map(dynamize);
  return { path: joinRoute(routeSegs), isApi };
}

/** Next.js Pages Router: pages/**\/x.tsx (UI) or pages/api/** (API). */
export function nextPagesRoute(norm: string): { path: string; isApi: boolean } | null {
  const segs = segmentsAfter(norm, 'pages');
  if (!segs || segs.length === 0) return null;
  const file = segs[segs.length - 1] ?? '';
  if (!/\.[tj]sx?$/.test(file)) return null;
  const base = file.replace(/\.[tj]sx?$/, '');
  if (/^(_app|_document|_error|_middleware)$/.test(base)) return null;
  const isApi = segs[0] === 'api' || segs.includes('api');
  const dir = segs.slice(0, -1);
  const routeSegs = (base === 'index' ? dir : [...dir, base]).map(dynamize);
  return { path: joinRoute(routeSegs), isApi };
}

/** SvelteKit: src/routes/**\/+page.svelte. */
export function svelteKitRoute(norm: string): string | null {
  if (!/\/\+page\.svelte$/.test(norm) && !/^\+page\.svelte$/.test(norm)) return null;
  const segs = segmentsAfter(norm, 'routes');
  if (!segs) return null;
  return joinRoute(segs.slice(0, -1).map(dynamize));
}
