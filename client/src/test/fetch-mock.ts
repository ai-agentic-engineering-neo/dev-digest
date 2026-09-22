/* test/fetch-mock.ts — stub global `fetch` with a route table so components
   run their real TanStack hooks against canned API responses.

     const api = mockFetch({ "GET /agents": [agent], "POST /findings/f1/accept": { finding } });
     ...
     expect(api.requests("POST", "/findings/f1/accept")).toHaveLength(1);

   Route keys are "METHOD /path", where a `:name` segment matches any value
   (exposed as req.params.name). A route value is the JSON body (status 200),
   a Response, or a function of the request returning either (may be async). Unmatched requests answer 404
   and are still recorded. `vi.unstubAllGlobals()` in setup.ts undoes the stub. */
import { vi } from "vitest";

export interface RecordedRequest {
  method: string;
  /** URL pathname, without the API base or query string. */
  path: string;
  search: string;
  body: unknown;
  params: Record<string, string>;
}

/** JSON body, Response, or a function of the request returning either. */
export type RouteHandler =
  | ((req: RecordedRequest) => unknown)
  | Response
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function matchRoute(route: string, method: string, path: string): Record<string, string> | null {
  const [routeMethod, routePath = ""] = route.split(" ");
  if (routeMethod !== method) return null;
  const want = routePath.split("/");
  const got = path.split("/");
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!;
    const g = decodeURIComponent(got[i]!);
    if (w.startsWith(":")) params[w.slice(1)] = g;
    else if (w !== g) return null;
  }
  return params;
}

export function mockFetch(routes: Record<string, RouteHandler> = {}) {
  const table = new Map(Object.entries(routes));
  const log: RecordedRequest[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const raw = init?.body;
    const body = typeof raw === "string" ? JSON.parse(raw) : undefined;
    const req: RecordedRequest = { method, path: url.pathname, search: url.search, body, params: {} };
    log.push(req);

    // Exact keys win over `:param` patterns; the last matching pattern wins.
    let route = table.get(`${method} ${url.pathname}`);
    if (route === undefined) {
      for (const [key, handler] of table) {
        const params = matchRoute(key, method, url.pathname);
        if (params) {
          route = handler;
          req.params = params;
        }
      }
    }
    if (route === undefined) {
      return jsonResponse({ error: { code: "not_found", message: `No mock for ${method} ${url.pathname}` } }, 404);
    }
    const out = typeof route === "function" ? await (route as (r: RecordedRequest) => unknown)(req) : route;
    return out instanceof Response ? out : jsonResponse(out);
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    fetch: fetchMock,
    /** Add or replace a route (e.g. to change what a refetch returns). */
    on(route: string, handler: RouteHandler) {
      table.set(route, handler);
    },
    /** Recorded requests, optionally filtered by method and path. */
    requests(method?: string, path?: string): RecordedRequest[] {
      return log.filter((r) => (!method || r.method === method) && (!path || r.path === path));
    },
  };
}
