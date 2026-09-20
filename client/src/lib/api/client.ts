/* api/client.ts — typed fetch client for the F1 Fastify engine (localhost:3001).
   Every resource module in lib/api/ builds on `apiFetch`. Errors are normalized
   to ApiError so the error-UX taxonomy (toast/inline/full-screen) can branch on
   status. `schema` is optional: pass a contract Zod schema to parse+validate the
   response, or omit it to keep the old typed-cast behaviour. */

import type { ZodType, ZodTypeDef } from "zod";

// Input pinned to `any`: a schema with `.default()` fields has an Input type
// that differs from its Output type (defaulted fields are optional on input,
// required on output). If T were inferred against both positions, TypeScript
// would infer the (wrong) Input shape for callers like `Agent` / `RunTrace`.
// Pinning Input lets inference lock onto Output only, which is what callers
// actually get back from `.parse()`.
type ResponseSchema<T> = ZodType<T, ZodTypeDef, any>;

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

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  schema?: ResponseSchema<T>,
): Promise<T> {
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

  if (res.status === 204) return undefined as T;
  const json = await res.json();
  return schema ? schema.parse(json) : (json as T);
}

export const api = {
  get: <T>(path: string, schema?: ResponseSchema<T>) => apiFetch<T>(path, undefined, schema),
  post: <T>(path: string, body?: unknown, schema?: ResponseSchema<T>) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, schema),
  put: <T>(path: string, body?: unknown, schema?: ResponseSchema<T>) =>
    apiFetch<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }, schema),
  patch: <T>(path: string, body?: unknown, schema?: ResponseSchema<T>) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }, schema),
  del: <T>(path: string, schema?: ResponseSchema<T>) => apiFetch<T>(path, { method: "DELETE" }, schema),
};
