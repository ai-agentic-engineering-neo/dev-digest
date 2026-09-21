import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import https from 'node:https';
import type { FetchedText, UrlFetcher } from './types.js';
import { isBlockedIp, isIpLiteral } from './ssrf.js';
import { ExternalServiceError, ValidationError } from '../../platform/errors.js';

/** Defaults — the 256 KB cap matches the client-side extract limit. */
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_CONTENT_TYPES = [
  /^text\//,
  /^application\/octet-stream$/,
  /^application\/(?:x-)?markdown$/,
];

type ResolveAll = (hostname: string) => Promise<{ address: string; family: number }[]>;

/** One HTTPS GET; returns status + headers + a body stream. Injectable for tests. */
export type HttpTransport = (
  url: URL,
  opts: {
    signal: AbortSignal;
    /** Connect-time DNS lookup that refuses non-public addresses. */
    lookup: NonNullable<https.RequestOptions['lookup']>;
  },
) => Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
}>;

export interface HttpUrlFetcherOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Test seam: replaces `dns.lookup(host, { all: true })`. */
  resolve?: ResolveAll;
  /** Test seam: replaces the real `https.request`. */
  transport?: HttpTransport;
}

const defaultResolve: ResolveAll = (hostname) =>
  new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (err, addrs: LookupAddress[]) =>
      err ? reject(err) : resolve(addrs),
    );
  });

const httpsTransport: HttpTransport = (url, { signal, lookup }) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        lookup,
        signal,
        headers: {
          accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1',
          'user-agent': 'devdigest-skill-import',
        },
      },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res }),
    );
    req.on('error', reject);
    req.end();
  });

/** Strip IPv6 brackets from a URL hostname. */
function bareHost(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/**
 * https-only, SSRF-guarded text fetcher. See `./types.ts` for the contract.
 * The private-address check happens inside the socket's `lookup`, i.e. on the
 * exact address that is connected to — resolving first and connecting later
 * would leave a DNS-rebinding window.
 */
export class HttpUrlFetcher implements UrlFetcher {
  private timeoutMs: number;
  private maxBytes: number;
  private maxRedirects: number;
  private resolve: ResolveAll;
  private transport: HttpTransport;

  constructor(opts: HttpUrlFetcherOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.resolve = opts.resolve ?? defaultResolve;
    this.transport = opts.transport ?? httpsTransport;
  }

  async fetchText(rawUrl: string): Promise<FetchedText> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let url = this.validate(rawUrl);
      for (let hop = 0; ; hop++) {
        const res = await this.transport(url, {
          signal: controller.signal,
          lookup: this.guardedLookup(),
        });

        if (REDIRECT_STATUSES.has(res.status)) {
          discard(res.body);
          const location = headerValue(res.headers.location);
          if (!location) throw new ValidationError('Redirect without a Location header');
          if (hop >= this.maxRedirects) {
            throw new ValidationError(`Too many redirects (max ${this.maxRedirects})`);
          }
          let next: URL;
          try {
            next = new URL(location, url);
          } catch {
            throw new ValidationError('Redirect to an invalid URL');
          }
          url = this.validate(next.toString(), 'Redirect target');
          continue;
        }
        if (res.status < 200 || res.status >= 300) {
          discard(res.body);
          throw new ValidationError(`URL returned HTTP ${res.status}`);
        }

        const contentType = headerValue(res.headers['content-type'])
          ?.split(';')[0]
          ?.trim()
          .toLowerCase();
        if (contentType && !ALLOWED_CONTENT_TYPES.some((re) => re.test(contentType))) {
          throw new ValidationError(`Unsupported content type "${contentType}" (expected text)`);
        }
        const declared = Number(headerValue(res.headers['content-length']));
        if (Number.isFinite(declared) && declared > this.maxBytes) {
          throw new ValidationError(`File is too large (max ${Math.round(this.maxBytes / 1024)} KB)`);
        }

        const text = await this.readCapped(res.body);
        return { url: url.toString(), text, ...(contentType ? { contentType } : {}) };
      }
    } catch (err) {
      if (controller.signal.aborted) {
        throw new ExternalServiceError(`Fetching the URL timed out after ${this.timeoutMs / 1000}s`);
      }
      if (err instanceof ValidationError || err instanceof ExternalServiceError) throw err;
      // Blocked-address errors surface from the guarded lookup through the socket.
      if ((err as { code?: string }).code === 'EBLOCKEDADDR') {
        throw new ValidationError('URL resolves to a private or reserved address');
      }
      throw new ExternalServiceError(`Could not fetch the URL: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Scheme / credentials / literal-IP checks (DNS-resolved hosts are checked at connect time). */
  private validate(raw: string, label = 'URL'): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ValidationError(`${label} is not a valid URL`);
    }
    if (url.protocol !== 'https:') throw new ValidationError(`${label} must use https`);
    if (url.username || url.password) {
      throw new ValidationError(`${label} must not contain credentials`);
    }
    const host = bareHost(url.hostname);
    if (!host) throw new ValidationError(`${label} has no host`);
    if (isIpLiteral(host) && isBlockedIp(host)) {
      throw new ValidationError(`${label} points to a private or reserved address`);
    }
    return url;
  }

  /** `lookup` for https.request: resolves ALL addresses and refuses if any is non-public. */
  private guardedLookup(): NonNullable<https.RequestOptions['lookup']> {
    const resolve = this.resolve;
    return ((
      hostname: string,
      options: { all?: boolean } | undefined,
      callback: (err: Error | null, address?: unknown, family?: number) => void,
    ) => {
      resolve(hostname).then(
        (addrs) => {
          if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address))) {
            const err = Object.assign(
              new Error('URL resolves to a private or reserved address'),
              { code: 'EBLOCKEDADDR' },
            );
            callback(err);
            return;
          }
          if (options?.all) callback(null, addrs);
          else callback(null, addrs[0]!.address, addrs[0]!.family);
        },
        (err: Error) => callback(err),
      );
    }) as NonNullable<https.RequestOptions['lookup']>;
  }

  private async readCapped(body: AsyncIterable<Uint8Array>): Promise<string> {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of body) {
      total += chunk.byteLength;
      if (total > this.maxBytes) {
        (body as { destroy?: () => void }).destroy?.();
        throw new ValidationError(`File is too large (max ${Math.round(this.maxBytes / 1024)} KB)`);
      }
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);
    if (buf.includes(0)) throw new ValidationError('File looks binary, expected a text file');
    return buf.toString('utf8');
  }
}

/** Release the socket of a response body we are not going to read. */
function discard(body: AsyncIterable<Uint8Array>): void {
  (body as { destroy?: () => void }).destroy?.();
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
