/**
 * Thin client over the DevDigest HTTP API. Only the fields the MCP tools use are
 * typed; everything else in the API responses is ignored (never forwarded).
 */

export interface ApiAgent {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface ApiRepo {
  id: string;
  owner: string;
  name: string;
  full_name: string;
}

export interface ApiPull {
  id: string | null;
  number: number;
  title: string;
}

export interface ApiRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  status: string | null; // running | done | failed | cancelled
  error: string | null;
  ran_at: string | null;
}

export interface ApiFinding {
  severity: string;
  title: string;
  file: string;
  start_line: number;
  rationale: string;
  dismissed_at: string | null;
}

export interface ApiReview {
  run_id: string | null;
  agent_id: string | null;
  agent_name?: string | null;
  kind: string;
  verdict: string | null;
  summary: string | null;
  score: number | null;
  findings: ApiFinding[];
}

export interface ApiConvention {
  category: string | null;
  rule: string;
  evidence_path: string;
  line_start: number | null;
  status: string;
}

export interface StartedRun {
  run_id: string;
  agent_id: string;
  agent_name: string;
}

/** The API answered with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSec: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The API could not be reached at all (not running / wrong URL). */
export class ApiUnreachableError extends Error {
  constructor(public readonly baseUrl: string, cause: unknown) {
    super(`DevDigest API unreachable at ${baseUrl}`, { cause });
    this.name = 'ApiUnreachableError';
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class DevDigestApi {
  constructor(
    readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  listAgents(signal?: AbortSignal): Promise<ApiAgent[]> {
    return this.request('GET', '/agents', undefined, signal);
  }

  listRepos(signal?: AbortSignal): Promise<ApiRepo[]> {
    return this.request('GET', '/repos', undefined, signal);
  }

  listPulls(repoId: string, signal?: AbortSignal): Promise<ApiPull[]> {
    return this.request('GET', `/repos/${repoId}/pulls`, undefined, signal);
  }

  async startReview(prId: string, agentId: string, signal?: AbortSignal): Promise<StartedRun[]> {
    const res = await this.request<{ runs: StartedRun[] }>(
      'POST',
      `/pulls/${prId}/review`,
      { agentId },
      signal,
    );
    return res.runs;
  }

  /** Every run of the PR (any status), newest first. */
  listRuns(prId: string, signal?: AbortSignal): Promise<ApiRun[]> {
    return this.request('GET', `/pulls/${prId}/runs`, undefined, signal);
  }

  listReviews(prId: string, signal?: AbortSignal): Promise<ApiReview[]> {
    return this.request('GET', `/pulls/${prId}/reviews`, undefined, signal);
  }

  listConventions(repoId: string, signal?: AbortSignal): Promise<ApiConvention[]> {
    return this.request('GET', `/repos/${repoId}/conventions`, undefined, signal);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new ApiUnreachableError(this.baseUrl, err);
    }
    if (!res.ok) {
      let code = 'http_error';
      let message = res.statusText || `HTTP ${res.status}`;
      try {
        const json = (await res.json()) as { error?: { code?: string; message?: string } };
        if (json?.error?.code) code = json.error.code;
        if (json?.error?.message) message = json.error.message;
      } catch {
        // non-JSON error body — keep the status text
      }
      const retry = Number(res.headers.get('retry-after'));
      throw new ApiError(res.status, code, message, Number.isFinite(retry) && retry > 0 ? retry : null);
    }
    return (await res.json()) as T;
  }
}
