// Ring 3. The ONLY place in this package that calls fetch(). Parses every
// response with the real @devdigest/shared schemas (safeParse) and converts all
// failures into ApiError — raw bodies, `details` and stacks never leave here.
import { z } from 'zod';
import {
  Agent,
  ApiErrorBody,
  BlastRadiusResponse,
  ConventionCandidate,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunSummary,
} from '@devdigest/shared';
import { ApiError, type DevDigestApi, type RunEndResult } from '../domain/ports.js';
import { consumeRunEvents, type SseEvent } from './sse.js';

export interface DevDigestClientOptions {
  /** Base URL without trailing slash. */
  baseUrl: string;
  httpTimeoutMs: number;
  /** Test seam; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const HealthBody = z.object({ status: z.literal('ok') });

function toError(init: ConstructorParameters<typeof ApiError>[0]): ApiError {
  return new ApiError(init);
}

function classifyThrown(err: unknown, endpoint: string): ApiError {
  const e = err as { name?: string; message?: string; cause?: { message?: string; code?: string } };
  const text = `${e?.message ?? ''} ${e?.cause?.message ?? ''}`.toLowerCase();
  // redirect:'error' surfaces as a failed fetch mentioning the redirect: a
  // redirecting server is not the DevDigest API.
  if (text.includes('redirect')) return toError({ kind: 'not_api', endpoint });
  return toError({ kind: 'unreachable', endpoint });
}

function kindForStatus(status: number): ApiError['kind'] {
  if (status === 400 || status === 422) return 'invalid_input';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'contract';
}

export class DevDigestClient implements DevDigestApi {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: DevDigestClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = opts.httpTimeoutMs;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async request<S extends z.ZodTypeAny>(
    method: 'GET' | 'POST',
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<z.infer<S>> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        redirect: 'error',
        headers: {
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw classifyThrown(err, path);
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    const isJson = contentType.includes('application/json');

    // A web UI (or any HTML) answering on this URL is never the API, whatever the status.
    if (contentType.includes('text/html')) {
      await res.body?.cancel().catch(() => undefined);
      throw toError({ kind: 'not_api', endpoint: path, status: res.status });
    }

    if (!res.ok) {
      let code: string | undefined;
      let serverMessage: string | undefined;
      if (isJson) {
        const parsed = ApiErrorBody.safeParse(await res.json().catch(() => undefined));
        if (parsed.success) {
          code = parsed.data.error.code;
          // Only 404/409 messages are ever surfaced, and only truncated.
          if (res.status === 404 || res.status === 409) {
            serverMessage = parsed.data.error.message.slice(0, 200);
          }
        }
      } else {
        await res.body?.cancel().catch(() => undefined);
      }
      throw toError({ kind: kindForStatus(res.status), endpoint: path, status: res.status, code, serverMessage });
    }

    if (!isJson) {
      await res.body?.cancel().catch(() => undefined);
      throw toError({ kind: 'not_api', endpoint: path, status: res.status });
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw toError({ kind: 'contract', endpoint: path, status: res.status });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw toError({ kind: 'contract', endpoint: path, status: res.status });
    return parsed.data;
  }

  async health(): Promise<void> {
    await this.request('GET', '/health', HealthBody);
  }

  listAgents(): Promise<Agent[]> {
    return this.request('GET', '/agents', z.array(Agent));
  }

  listRepos(): Promise<Repo[]> {
    return this.request('GET', '/repos', z.array(Repo));
  }

  listPulls(repoId: string): Promise<PrMeta[]> {
    return this.request('GET', `/repos/${encodeURIComponent(repoId)}/pulls`, z.array(PrMeta));
  }

  listConventions(repoId: string): Promise<ConventionCandidate[]> {
    return this.request('GET', `/repos/${encodeURIComponent(repoId)}/conventions`, z.array(ConventionCandidate));
  }

  startReview(prId: string, agentId: string): Promise<ReviewRunResponse> {
    return this.request('POST', `/pulls/${encodeURIComponent(prId)}/review`, ReviewRunResponse, { agentId });
  }

  listRuns(prId: string): Promise<RunSummary[]> {
    return this.request('GET', `/pulls/${encodeURIComponent(prId)}/runs`, z.array(RunSummary));
  }

  listReviews(prId: string): Promise<ReviewRecord[]> {
    return this.request('GET', `/pulls/${encodeURIComponent(prId)}/reviews`, z.array(ReviewRecord));
  }

  getBlast(prId: string): Promise<BlastRadiusResponse> {
    return this.request('GET', `/pulls/${encodeURIComponent(prId)}/blast`, BlastRadiusResponse);
  }

  async waitForRunEnd(
    runId: string,
    signal: AbortSignal,
    onEvent?: (event: SseEvent) => void,
  ): Promise<RunEndResult> {
    const path = `/runs/${encodeURIComponent(runId)}/events`;
    try {
      return await consumeRunEvents(`${this.base}${path}`, signal, onEvent, this.fetchImpl);
    } catch (err) {
      throw classifyThrown(err, path);
    }
  }
}
