import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import type { LookupFunction } from 'node:net';
import { ExternalServiceError, ValidationError } from '../../platform/errors.js';
import type { FetchedText, RemoteTextFetcher } from '../../modules/skills/ports.js';

/**
 * SSRF-safe fetch of a small public text file ("Import skill from URL").
 *
 * - `https:` only, default port only, no credentials in the URL.
 * - Every address the host resolves to must be public. The check runs inside
 *   the socket's own `lookup`, so the IP that is validated is the IP that is
 *   connected to (no DNS-rebinding gap between "check" and "connect").
 * - Redirects are followed by hand (≤ 3), each hop re-validated.
 * - 5 s timeout, 64 KB cap (streamed, the socket is cut at the cap), text only.
 * - No cookies, no auth headers. A GitHub `blob` page URL is rewritten to the raw file.
 */

export const FETCH_TIMEOUT_MS = 5_000;
export const FETCH_MAX_BYTES = 64 * 1024;
export const FETCH_MAX_REDIRECTS = 3;

const ALLOWED_TYPES = [/^text\//i, /^application\/(?:octet-stream|markdown|x-markdown)\b/i];

/** `https://github.com/o/r/blob/<ref>/<path>` → `https://raw.githubusercontent.com/o/r/<ref>/<path>`. */
export function rawGitHubUrl(url: URL): URL {
  if (url.hostname !== 'github.com') return url;
  const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  return m ? new URL(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`) : url;
}

/** Throws a 422 when the URL itself is not acceptable (before any network I/O). */
export function assertImportableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError('Not a valid URL');
  }
  if (url.protocol !== 'https:') throw new ValidationError('Only https:// URLs can be imported');
  if (url.port && url.port !== '443') throw new ValidationError('Only the default https port is allowed');
  if (url.username || url.password) throw new ValidationError('URLs with credentials are not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new ValidationError('Private or local hosts cannot be imported from');
  }
  if (isIP(host) && isPrivateAddress(host)) {
    throw new ValidationError('Private or local hosts cannot be imported from');
  }
  return url;
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

const PRIVATE_V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

/** True for loopback, private, link-local, CGNAT, multicast, reserved (v4 and v6). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const n = ipv4ToInt(ip);
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return true;
  // IPv4-mapped, dotted (::ffff:127.0.0.1) or hex (::ffff:7f00:1 — what URL() normalises to).
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]!);
  const mappedHex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1]!, 16);
    const lo = parseInt(mappedHex[2]!, 16);
    return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6); // ULA, link-local, multicast
}

/** dns.lookup that refuses to hand a private address to the socket. */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = addresses as LookupAddress[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad || list.length === 0) {
      return callback(Object.assign(new Error('private address'), { code: 'EPRIVATE' }), '', 0);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
};

interface HopResult {
  status: number;
  location?: string;
  contentType: string;
  body?: string;
}

function fetchOnce(url: URL): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: 'GET',
        lookup: publicOnlyLookup,
        headers: { accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1', 'user-agent': 'devdigest-skill-import' },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers['content-type'] ?? '');
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType });
        }
        if (status !== 200) {
          res.resume();
          return resolve({ status, contentType });
        }
        if (contentType && !ALLOWED_TYPES.some((re) => re.test(contentType))) {
          res.destroy();
          return reject(new ValidationError(`The URL is not a text file (content-type ${contentType})`));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > FETCH_MAX_BYTES) {
            res.destroy();
            reject(new ValidationError(`The file is larger than ${FETCH_MAX_BYTES / 1024} KB`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ status, contentType, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end();
  });
}

/** Map socket / DNS errors to user-readable AppErrors; AppErrors pass through. */
function toAppError(err: unknown): Error {
  if (err instanceof ValidationError || err instanceof ExternalServiceError) return err;
  const code = (err as { code?: string }).code;
  if (code === 'EPRIVATE') return new ValidationError('Private or local hosts cannot be imported from');
  if (code === 'ETIMEDOUT') return new ExternalServiceError('The URL did not answer within 5 seconds');
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new ValidationError('The host could not be found');
  return new ExternalServiceError('Could not fetch the URL');
}

export class SafeHttpTextFetcher implements RemoteTextFetcher {
  async fetchText(raw: string): Promise<FetchedText> {
    let url = rawGitHubUrl(assertImportableUrl(raw));
    for (let hop = 0; hop <= FETCH_MAX_REDIRECTS; hop++) {
      let res: HopResult;
      try {
        res = await fetchOnce(url);
      } catch (err) {
        throw toAppError(err);
      }
      if (res.location !== undefined) {
        if (hop === FETCH_MAX_REDIRECTS) throw new ValidationError('Too many redirects');
        url = rawGitHubUrl(assertImportableUrl(new URL(res.location, url).toString()));
        continue;
      }
      if (res.status !== 200 || res.body === undefined) {
        throw new ValidationError(`The URL answered HTTP ${res.status}`);
      }
      return { url: url.toString(), text: res.body };
    }
    throw new ValidationError('Too many redirects');
  }
}
