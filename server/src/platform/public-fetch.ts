import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { Readable } from 'node:stream';

/**
 * S7 (security hardening) — fetch a USER-SUPPLIED URL without letting it reach
 * the machine's own network. A hostname check on the URL string is not enough:
 * `localtest.me` resolves to 127.0.0.1, `[::ffff:127.0.0.1]` slips past an IPv4
 * regex, a public URL can 302 to `http://169.254.169.254/`, and DNS can answer
 * differently at connect time (rebinding). So:
 *   - every address is checked at CONNECT time, inside the socket's DNS lookup;
 *   - redirects are followed by hand (max 5), each hop re-validated;
 *   - HTTPS only, no credentials in the URL.
 */

/** Thrown when the target (or a redirect hop) is not a public address. */
export class BlockedHostError extends Error {
  constructor(public readonly host: string) {
    super(`Refusing to connect to a non-public address for host '${host}'`);
    this.name = 'BlockedHostError';
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  // NOT `::ffff:0:0/96`: Node's BlockList maps every IPv4 address into that
  // range, so the rule would block all of IPv4. Mapped addresses are unwrapped
  // and checked against the IPv4 rules instead.
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/** `::ffff:127.0.0.1` / `::ffff:7f00:1` → `127.0.0.1`; anything else → null. */
function unwrapMappedIpv4(ipv6: string): string | null {
  const m = ipv6.toLowerCase().match(/^(?:0{0,4}:){0,5}:?ffff:(.+)$/);
  if (!m?.[1]) return null;
  const tail = m[1];
  if (isIP(tail) === 4) return tail;
  const hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex?.[1] || !hex[2]) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

/** True when `ip` must not be fetched. Anything that isn't an IP literal is refused too. */
export function isBlockedAddress(ip: string): boolean {
  const literal = stripBrackets(ip);
  const family = isIP(literal);
  if (family === 4) return blocked.check(literal, 'ipv4');
  if (family === 6) {
    const mapped = unwrapMappedIpv4(literal);
    return mapped ? blocked.check(mapped, 'ipv4') : blocked.check(literal, 'ipv6');
  }
  return true;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** Resolves like the default lookup, then refuses if ANY address is non-public. */
function guardedLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => isBlockedAddress(a.address))) {
      return callback(new BlockedHostError(hostname) as NodeJS.ErrnoException, []);
    }
    if (options.all) return callback(null, list);
    const first = list[0]!;
    callback(null, first.address, first.family);
  });
}

function assertFetchable(url: URL): void {
  if (url.protocol !== 'https:') throw new BlockedHostError(url.hostname);
  if (url.username || url.password) throw new BlockedHostError(url.hostname);
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) throw new BlockedHostError(host);
  // Node skips `lookup` for IP literals, so check those up front.
  if (isIP(stripBrackets(host)) !== 0 && isBlockedAddress(host)) throw new BlockedHostError(host);
}

function toHeaders(res: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
  }
  return headers;
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function getOnce(url: URL, signal: AbortSignal): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: 'GET',
        lookup: guardedLookup as never,
        signal,
        headers: { 'user-agent': 'DevDigest', accept: 'text/markdown, text/plain, */*' },
      },
      (res) => {
        const status = res.statusCode ?? 502;
        const body = NULL_BODY_STATUSES.has(status)
          ? null
          : (Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>);
        if (body === null) res.resume();
        try {
          resolve(new Response(body, { status, headers: toHeaders(res) }));
        } catch (e) {
          res.destroy();
          reject(e);
        }
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const MAX_REDIRECTS = 5;

/**
 * GET a user-supplied URL, refusing any non-public destination (including
 * via redirect or DNS). Returns the final non-redirect Response.
 * Throws BlockedHostError for a refused destination.
 */
export async function fetchPublicUrl(rawUrl: string, signal: AbortSignal): Promise<Response> {
  let url = new URL(rawUrl);
  for (let hop = 0; ; hop++) {
    assertFetchable(url);
    const res = await getOnce(url, signal);
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return res;
    await res.body?.cancel();
    if (hop >= MAX_REDIRECTS) throw new Error('Too many redirects');
    url = new URL(location, url);
  }
}
