/** Thin JSON client for the DevDigest API. Maps every failure to a typed ApiError. */
export type ApiErrorKind = 'unavailable' | 'api';

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly retryAfterS?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  get<T>(path: string, signal?: AbortSignal): Promise<T>;
  post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T>;
}

export interface ApiClientOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function summarizeDetails(details: unknown): string {
  if (details === undefined || details === null) return '';
  try {
    const s = JSON.stringify(details);
    return s.length > 300 ? `${s.slice(0, 300)}...` : s;
  } catch {
    return '';
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function toApiError(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const retryHeader = Number(res.headers.get('retry-after'));
  const retryAfterS = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined;
  const envelope = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : undefined;
  if (!envelope) {
    return new ApiError('api', `DevDigest API returned HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
  }
  const code = typeof envelope.code === 'string' ? envelope.code : undefined;
  const message = typeof envelope.message === 'string' ? envelope.message : `HTTP ${res.status}`;
  if (res.status === 404) {
    return new ApiError('api', `Not found: ${message}`, 404, code);
  }
  if (res.status === 422) {
    const d = summarizeDetails(envelope.details);
    return new ApiError('api', `Invalid input: ${message}${d ? ` (${d})` : ''}`, 422, code);
  }
  if (res.status === 429) {
    const wait = retryAfterS ? `retry in ${retryAfterS}s` : 'retry in a minute';
    return new ApiError(
      'api',
      `Rate limited by the DevDigest API (POST /pulls/:id/review allows 10/min; global 120/min), ${wait}.`,
      429,
      code,
      retryAfterS,
    );
  }
  return new ApiError('api', `${message} (${code ?? `HTTP ${res.status}`})`, res.status, code);
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(method: 'GET' | 'POST', path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([timeout, signal]) : timeout;
    let res: Response;
    try {
      res = await opts.fetch(`${opts.baseUrl}${path}`, {
        method,
        headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: combined,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      if (timeout.aborted) {
        throw new ApiError('unavailable', `DevDigest API at ${opts.baseUrl} did not answer within ${timeoutMs / 1000}s.`);
      }
      throw new ApiError(
        'unavailable',
        `DevDigest API is not reachable at ${opts.baseUrl}. Start it with ./scripts/dev.sh (or set DEVDIGEST_API_URL).`,
      );
    }
    if (!res.ok) throw await toApiError(res);
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError('api', `DevDigest API returned non-JSON for ${method} ${path}: ${text.slice(0, 200)}`, res.status);
    }
  }

  return {
    get: (path, signal) => request('GET', path, undefined, signal),
    post: (path, body, signal) => request('POST', path, body, signal),
  };
}
