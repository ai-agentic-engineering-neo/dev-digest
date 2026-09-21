/* api.ts — typed fetch client for the F1 Fastify engine (localhost:3001).
   All hooks build on `apiFetch`. Errors are normalized to ApiError so the
   error-UX taxonomy (toast/inline/full-screen) can branch on status. */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Core fetch + error-normalization, returning the parsed body ALONGSIDE the
 *  HTTP status. `apiFetch` (below) is the status-discarding convenience most
 *  callers want; a caller that needs to distinguish e.g. 200 vs 201 on the
 *  same success shape (idempotent-return vs newly-created) uses
 *  `apiFetchWithStatus` directly instead of re-deriving it from the body. */
async function apiFetchWithStatus<T>(
  path: string,
  init?: RequestInit
): Promise<{ data: T; status: number }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        // Only declare a JSON body when one is actually sent — otherwise a
        // body-less POST/PUT (e.g. tour generate, refresh, reindex) trips
        // Fastify's "Body cannot be empty when content-type is application/json".
        ...(init?.body != null ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    // network failure / API down → full-screen error candidate
    throw new ApiError(
      `Cannot reach the DevDigest engine at ${API_BASE}. Is the API running?`,
      0,
      "network_error",
      e
    );
  }

  if (!res.ok) {
    let code: string | undefined;
    let message = `${res.status} ${res.statusText}`;
    let details: unknown;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message ?? message;
        details = body.error.details;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code, details);
  }

  if (res.status === 204) return { data: undefined as T, status: res.status };
  return { data: (await res.json()) as T, status: res.status };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return (await apiFetchWithStatus<T>(path, init)).data;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  /** Same as `post`, but keeps the HTTP status — e.g. the eval-case-from-
   *  finding route returns 201 on real creation and 200 on the idempotent
   *  return-the-existing-case path (D17/AC-1), and the two need different
   *  copy in the toast. */
  postWithStatus: <T>(path: string, body?: unknown) =>
    apiFetchWithStatus<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
