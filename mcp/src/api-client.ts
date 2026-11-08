/**
 * Thin client over the DevDigest HTTP API. Every response is validated with a Zod schema of
 * only the fields the MCP tools use; unknown keys are stripped (never forwarded).
 */
import { z } from 'zod';

export const ApiAgent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
export type ApiAgent = z.infer<typeof ApiAgent>;

export const ApiRepo = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  full_name: z.string(),
});
export type ApiRepo = z.infer<typeof ApiRepo>;

export const ApiPull = z.object({
  id: z.string().nullable(),
  number: z.number().int(),
  title: z.string(),
});
export type ApiPull = z.infer<typeof ApiPull>;

export const ApiRun = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  status: z.string().nullable(), // running | done | failed | cancelled
  error: z.string().nullable(),
  ran_at: z.string().nullable(),
  /** USD spent by the run (partial for failed runs); null/absent = unknown. */
  cost_usd: z.number().nullish(),
});
export type ApiRun = z.infer<typeof ApiRun>;

export const ApiFinding = z.object({
  severity: z.string(),
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  rationale: z.string(),
  suggestion: z.string().nullish(),
  dismissed_at: z.string().nullable(),
});
export type ApiFinding = z.infer<typeof ApiFinding>;

export const ApiReview = z.object({
  id: z.string(),
  run_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.string(),
  verdict: z.string().nullable(),
  summary: z.string().nullable(),
  score: z.number().nullable(),
  model: z.string().nullable(),
  created_at: z.string(),
  findings: z.array(ApiFinding),
});
export type ApiReview = z.infer<typeof ApiReview>;

export const ApiConvention = z.object({
  category: z.string().nullable(),
  rule: z.string(),
  evidence_path: z.string(),
  line_start: z.number().int().nullable(),
  confidence: z.number(),
  status: z.string(),
});
export type ApiConvention = z.infer<typeof ApiConvention>;

export const StartedRun = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type StartedRun = z.infer<typeof StartedRun>;

const ApiBlastCaller = z.object({ name: z.string(), file: z.string(), line: z.number().int() });
const ApiBlastDownstream = z.object({
  symbol: z.string(),
  file: z.string(),
  kind: z.string(),
  callers: z.array(ApiBlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});

/** GET /pulls/:id/blast. `reason` is a plain string so a new server-side reason does not break the tool. */
export const ApiBlast = z.object({
  pr_id: z.string(),
  head_sha: z.string(),
  indexed_sha: z.string().nullable(),
  link_sha: z.string(),
  changed_symbols: z.array(z.object({ name: z.string(), file: z.string(), kind: z.string() })),
  downstream: z.array(ApiBlastDownstream),
  unattributed_endpoints: z.array(z.string()),
  summary: z.string(),
  counts: z.object({
    symbols: z.number().int(),
    callers: z.number().int(),
    endpoints: z.number().int(),
    crons: z.number().int(),
  }),
  callers_omitted: z.number().int(),
  degraded: z.boolean(),
  reason: z.string().nullable(),
});
export type ApiBlast = z.infer<typeof ApiBlast>;

/** GET /pulls/:id/prior-pulls — earlier PRs of the same repo touching this PR's files (newest first). */
export const ApiPriorPull = z.object({
  pr_id: z.string(),
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  status: z.string(),
  updated_at: z.string().nullable(),
  shared_count: z.number().int(),
  shared_files: z.array(z.string()),
});
export type ApiPriorPull = z.infer<typeof ApiPriorPull>;
export const ApiPriorPulls = z.object({ pr_id: z.string(), total: z.number().int(), pulls: z.array(ApiPriorPull) });
export type ApiPriorPulls = z.infer<typeof ApiPriorPulls>;

const StartReviewResponse = z.object({ runs: z.array(StartedRun) });

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

/** The API answered 2xx, but the body does not match the shape the tools rely on (API/MCP version drift). */
export class ApiShapeError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly detail: string,
  ) {
    super(`DevDigest API returned an unexpected response for ${endpoint}: ${detail}`);
    this.name = 'ApiShapeError';
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
    return this.request(z.array(ApiAgent), 'GET', '/agents', undefined, signal);
  }

  listRepos(signal?: AbortSignal): Promise<ApiRepo[]> {
    return this.request(z.array(ApiRepo), 'GET', '/repos', undefined, signal);
  }

  listPulls(repoId: string, signal?: AbortSignal): Promise<ApiPull[]> {
    return this.request(z.array(ApiPull), 'GET', `/repos/${repoId}/pulls`, undefined, signal);
  }

  async startReview(prId: string, agentId: string, signal?: AbortSignal): Promise<StartedRun[]> {
    const res = await this.request(
      StartReviewResponse,
      'POST',
      `/pulls/${prId}/review`,
      { agentId },
      signal,
    );
    return res.runs;
  }

  /** Every run of the PR (any status), newest first. */
  listRuns(prId: string, signal?: AbortSignal): Promise<ApiRun[]> {
    return this.request(z.array(ApiRun), 'GET', `/pulls/${prId}/runs`, undefined, signal);
  }

  listReviews(prId: string, signal?: AbortSignal): Promise<ApiReview[]> {
    return this.request(z.array(ApiReview), 'GET', `/pulls/${prId}/reviews`, undefined, signal);
  }

  listConventions(repoId: string, signal?: AbortSignal): Promise<ApiConvention[]> {
    return this.request(z.array(ApiConvention), 'GET', `/repos/${repoId}/conventions`, undefined, signal);
  }

  /** Read-only impact map of a PR. Never triggers a re-index. */
  getBlast(prId: string, signal?: AbortSignal): Promise<ApiBlast> {
    return this.request(ApiBlast, 'GET', `/pulls/${prId}/blast`, undefined, signal);
  }

  getPriorPulls(prId: string, signal?: AbortSignal): Promise<ApiPriorPulls> {
    return this.request(ApiPriorPulls, 'GET', `/pulls/${prId}/prior-pulls`, undefined, signal);
  }

  private async request<S extends z.ZodTypeAny>(
    schema: S,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<z.output<S>> {
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
    const endpoint = `${method} ${path}`;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiShapeError(endpoint, 'body is not valid JSON');
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ApiShapeError(endpoint, describeIssues(parsed.error));
    return parsed.data;
  }
}

/** First few Zod issues as `path: message` — short enough for a tool error. */
function describeIssues(error: z.ZodError): string {
  const shown = error.issues
    .slice(0, 3)
    .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`);
  const more = error.issues.length > 3 ? ` (+${error.issues.length - 3} more)` : '';
  return shown.join('; ') + more;
}
