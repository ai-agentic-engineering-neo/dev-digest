import type { ApiErrorBody } from './types.js';

/**
 * Thrown for any non-2xx response from the DevDigest API. `code` mirrors
 * `server/src/platform/errors.ts`'s `AppError.code` taxonomy
 * (`not_found`, `validation_error`, `external_service_error`, ...) when the
 * body parses as `ApiErrorBody`; falls back to a generic code otherwise.
 */
export class ApiCallError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiCallError';
  }
}

/** Injectable port so tool handlers/tests never depend on a real network call. */
export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error?: unknown }).error === 'object' &&
    (value as { error?: unknown }).error !== null &&
    'code' in (value as { error: object }).error &&
    'message' in (value as { error: object }).error
  );
}

async function toApiCallError(res: Response): Promise<ApiCallError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (isApiErrorBody(body)) {
    return new ApiCallError(res.status, body.error.code, body.error.message);
  }
  return new ApiCallError(res.status, 'unknown_error', `DevDigest API returned ${res.status}`);
}

/** Real HTTP implementation. Base URL comes from `API_BASE_URL` (see `.mcp.json`). */
export class FetchApiClient implements ApiClient {
  constructor(private readonly baseUrl: string) {}

  async get<T>(path: string): Promise<T> {
    const res = await fetch(new URL(path, this.baseUrl));
    if (!res.ok) throw await toApiCallError(res);
    return (await res.json()) as T;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(new URL(path, this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw await toApiCallError(res);
    return (await res.json()) as T;
  }
}
