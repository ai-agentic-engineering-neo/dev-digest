// Ring 1. The port the services depend on. No IO here; the only implementation
// lives in adapters/devdigest-client.ts.
import type {
  Agent,
  ConventionCandidate,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunSummary,
} from '@devdigest/shared';

export type ApiErrorKind =
  | 'unreachable'
  | 'not_api'
  | 'invalid_input'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'server'
  | 'contract';

/**
 * Failure of a call to the DevDigest API. `message` is a short internal label
 * and is NEVER shown to the model as-is: domain/errors.ts builds the user-facing
 * text. Server `details`, stack traces and 5xx bodies are deliberately not
 * carried here.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;
  /** Short machine code from the API error envelope (e.g. "validation_error"). */
  readonly code: string | undefined;
  /** Path of the failing endpoint (no query, no host), e.g. "/agents". */
  readonly endpoint: string;
  /** Server-provided message; kept only for 404/409 and truncated to 200 chars. */
  readonly serverMessage: string | undefined;

  constructor(init: {
    kind: ApiErrorKind;
    endpoint: string;
    status?: number | undefined;
    code?: string | undefined;
    serverMessage?: string | undefined;
  }) {
    super(`${init.kind}${init.status !== undefined ? ` (HTTP ${init.status})` : ''} at ${init.endpoint}`);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.endpoint = init.endpoint;
    this.status = init.status;
    this.code = init.code;
    this.serverMessage = init.serverMessage;
  }
}

export interface RunEndResult {
  /** `closed`: the SSE stream ended by itself. `aborted`: the signal fired first. */
  outcome: 'closed' | 'aborted';
}

export interface DevDigestApi {
  /** Resolves when `/health` answers `{status:'ok'}`; otherwise throws ApiError. */
  health(): Promise<void>;
  listAgents(): Promise<Agent[]>;
  listRepos(): Promise<Repo[]>;
  listPulls(repoId: string): Promise<PrMeta[]>;
  listConventions(repoId: string): Promise<ConventionCandidate[]>;
  /** Starts a run (fire-and-forget on the server); returns run ids. */
  startReview(prId: string, agentId: string): Promise<ReviewRunResponse>;
  listRuns(prId: string): Promise<RunSummary[]>;
  listReviews(prId: string): Promise<ReviewRecord[]>;
  /**
   * Reads `GET /runs/:id/events` until the stream closes or `signal` aborts.
   * Never cancels the run on the server.
   */
  waitForRunEnd(
    runId: string,
    signal: AbortSignal,
    onEvent?: (event: { kind: string; message: string }) => void,
  ): Promise<RunEndResult>;
}
