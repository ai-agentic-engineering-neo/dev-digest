import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { Agent, request as undiciRequest } from 'undici';
import type { WebFetchClient, WebFetchOptions, WebFetchResult } from '@devdigest/shared';
import { TimeoutError, withRetry, withTimeout } from '../../platform/resilience.js';
import { isPublicUnicast } from './ip-policy.js';

const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_TYPES = new Set(['text/plain', 'text/markdown', 'text/x-markdown']);

/** Short, content-free reason codes. Callers may log `code`; nothing else is safe to log. */
export type WebFetchErrorCode =
  | 'invalid_url'
  | 'blocked_scheme'
  | 'blocked_userinfo'
  | 'blocked_port'
  | 'blocked_host'
  | 'dns_failed'
  | 'too_many_redirects'
  | 'unsupported_type'
  | 'http_error'
  | 'timeout'
  | 'network_error';

export class WebFetchError extends Error {
  constructor(
    readonly code: WebFetchErrorCode,
    /** HTTP status, set for `http_error` only. */
    readonly status?: number,
  ) {
    // Only the reason code and status — never the URL, the response body or a vendor message.
    super(status === undefined ? `web_fetch_${code}` : `web_fetch_${code}_${status}`);
    this.name = 'WebFetchError';
  }
}

// ---------- Test seams (no network in unit tests) ----------
export interface ResolvedAddress {
  address: string;
  family: number;
}

/** Resolve ALL addresses of a hostname. */
export type LookupFn = (hostname: string) => Promise<ResolvedAddress[]>;

export interface FetchRequestInit {
  url: URL;
  /** Already policy-validated. A real implementation must connect only to these. */
  addresses: ResolvedAddress[];
  signal: AbortSignal;
}

export interface FetchResponse {
  statusCode: number;
  /** Lower-cased header names. */
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  /** Idempotent: release the body and the connection. */
  dispose(): void;
}

export type RequestFn = (init: FetchRequestInit) => Promise<FetchResponse>;

export interface HttpWebFetchOptions {
  /** Default byte cap when a call does not pass `maxBytes`. */
  maxBytes?: number;
  timeoutMs?: number;
  lookup?: LookupFn;
  request?: RequestFn;
}

const defaultLookup: LookupFn = async (hostname) =>
  dns.lookup(hostname, { all: true, verbatim: true });

/**
 * dns.lookup replacement that can only ever answer with the already-validated addresses.
 * Exported for the rebinding-pin unit test.
 */
export function pinnedLookup(addresses: ResolvedAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const first = addresses[0];
    if (!first) {
      callback(Object.assign(new Error('no pinned address'), { code: 'ENOTFOUND' }), '', 4);
      return;
    }
    if (options.all) {
      // net.connect with autoSelectFamily asks for the whole list.
      (callback as unknown as (e: null, a: ResolvedAddress[]) => void)(null, addresses);
    } else {
      callback(null, first.address, first.family);
    }
  };
}

/**
 * Default transport: one undici Agent per hop whose connect `lookup` is pinned to the
 * validated addresses (DNS-rebinding guard). TLS SNI and Host stay the original hostname.
 * Redirects are NOT followed here (undici.request does not).
 */
const defaultRequest: RequestFn = async ({ url, addresses, signal }) => {
  const agent = new Agent({ connect: { lookup: pinnedLookup(addresses) } });
  let disposed = false;
  let body: { destroy(): unknown } | undefined;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    body?.destroy();
    void agent.close().catch(() => undefined);
  };
  try {
    const res = await undiciRequest(url, {
      method: 'GET',
      dispatcher: agent,
      signal,
      headers: { accept: 'text/markdown, text/plain;q=0.9', 'user-agent': 'devdigest-web-fetch' },
    });
    body = res.body;
    return { statusCode: res.statusCode, headers: res.headers, body: res.body, dispose };
  } catch (err) {
    dispose();
    throw err;
  }
};

// ---------- URL gate ----------
function parseUrl(raw: string | URL, base?: URL): URL {
  try {
    return new URL(raw, base);
  } catch {
    throw new WebFetchError('invalid_url');
  }
}

/** https only, no userinfo, default port only. */
function assertAllowedUrl(url: URL): void {
  if (url.protocol !== 'https:') throw new WebFetchError('blocked_scheme');
  if (url.username || url.password) throw new WebFetchError('blocked_userinfo');
  // WHATWG URL drops an explicit :443 for https, so any remaining port is non-default.
  if (url.port !== '') throw new WebFetchError('blocked_port');
}

/** Resolve the host and require EVERY address to be public unicast (fail-closed). */
async function resolvePublicAddresses(url: URL, lookup: LookupFn): Promise<ResolvedAddress[]> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(host);
  let addresses: ResolvedAddress[];
  if (literalFamily !== 0) {
    addresses = [{ address: host, family: literalFamily }];
  } else {
    try {
      addresses = await lookup(host);
    } catch {
      throw new WebFetchError('dns_failed');
    }
  }
  if (addresses.length === 0) throw new WebFetchError('dns_failed');
  if (!addresses.every((a) => isPublicUnicast(a.address))) throw new WebFetchError('blocked_host');
  return addresses;
}

// ---------- Body ----------
function headerValue(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/** Read at most `maxBytes`; on overflow return the prefix cut on a UTF-8 codepoint boundary. */
async function readCapped(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for await (const chunk of body) {
    chunks.push(chunk);
    total += chunk.byteLength;
    if (total > maxBytes) {
      truncated = true;
      break; // leaving the loop destroys the underlying stream
    }
  }
  const buf = Buffer.concat(chunks);
  let end = truncated ? maxBytes : buf.byteLength;
  if (truncated) {
    // buf[end] is the first dropped byte: while it is a continuation byte the cut splits a char.
    while (end > 0 && ((buf[end] ?? 0) & 0xc0) === 0x80) end--;
  }
  return { text: new TextDecoder('utf-8').decode(buf.subarray(0, end)), truncated };
}

/**
 * WebFetchClient over undici. SSRF-guarded (OWASP SSRF Prevention): https only, every
 * resolved address must be public unicast, the connection is pinned to the validated
 * address, redirects are followed manually (max 3) and re-validated per hop, only
 * plain/markdown text is accepted, and the body is byte-capped.
 */
export class HttpWebFetchClient implements WebFetchClient {
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly lookup: LookupFn;
  private readonly request: RequestFn;

  constructor(opts: HttpWebFetchOptions = {}) {
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.lookup = opts.lookup ?? defaultLookup;
    this.request = opts.request ?? defaultRequest;
  }

  async fetchText(url: string, opts: WebFetchOptions = {}): Promise<WebFetchResult> {
    const maxBytes = opts.maxBytes ?? this.maxBytes;
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    try {
      return await withTimeout(
        withRetry(() => this.fetchOnce(url, maxBytes, controller.signal), {
          retries: 1,
          // Only 429 / 5xx; never once the wall-clock budget has aborted the attempt.
          isRetryable: (err) =>
            !controller.signal.aborted &&
            err instanceof WebFetchError &&
            err.status !== undefined &&
            (err.status === 429 || err.status >= 500),
        }),
        timeoutMs,
      );
    } catch (err) {
      if (err instanceof TimeoutError) throw new WebFetchError('timeout');
      throw err;
    } finally {
      controller.abort();
    }
  }

  private async fetchOnce(rawUrl: string, maxBytes: number, signal: AbortSignal): Promise<WebFetchResult> {
    let current = parseUrl(rawUrl);
    for (let hop = 0; ; hop++) {
      assertAllowedUrl(current);
      const addresses = await resolvePublicAddresses(current, this.lookup);
      let res: FetchResponse;
      try {
        res = await this.request({ url: current, addresses, signal });
      } catch (err) {
        throw err instanceof WebFetchError ? err : new WebFetchError('network_error');
      }
      try {
        if (REDIRECT_STATUSES.has(res.statusCode)) {
          if (hop >= MAX_REDIRECTS) throw new WebFetchError('too_many_redirects');
          const location = headerValue(res.headers['location']);
          if (!location) throw new WebFetchError('http_error', res.statusCode);
          current = parseUrl(location, current); // re-gated and re-resolved on the next hop
          continue;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw new WebFetchError('http_error', res.statusCode);
        }
        const contentType = headerValue(res.headers['content-type']).split(';')[0]!.trim().toLowerCase();
        const encoding = headerValue(res.headers['content-encoding']).trim().toLowerCase();
        if (!ALLOWED_TYPES.has(contentType) || (encoding !== '' && encoding !== 'identity')) {
          throw new WebFetchError('unsupported_type');
        }
        let read: { text: string; truncated: boolean };
        try {
          read = await readCapped(res.body, maxBytes);
        } catch (err) {
          throw err instanceof WebFetchError ? err : new WebFetchError('network_error');
        }
        return {
          text: read.text,
          status: read.truncated ? 'truncated' : 'ok',
          contentType,
          finalUrl: current.href,
        };
      } finally {
        res.dispose();
      }
    }
  }
}
