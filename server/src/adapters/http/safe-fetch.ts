import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { Readable } from 'node:stream';
import { BlockedHostError, type HttpFetch } from '../../domain/ports/http.js';
import { isBlockedAddress, isIpLiteral } from '../../platform/net-policy.js';

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * `lookup` for http(s).request: resolves like the default, then refuses if
 * ANY resolved address is non-public. Because this runs inside the socket
 * connect, the address checked is the address connected to — closing the
 * DNS-rebinding gap a separate "resolve, then fetch" check would leave.
 */
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

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function toHeaders(res: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
  }
  return headers;
}

/**
 * HttpFetch over node:http/https with a connect-time address guard. GET only,
 * no redirect following, no cookies, no proxy — exactly what a one-shot
 * "fetch this public URL" needs.
 */
export const safeFetch: HttpFetch = (url, init) =>
  new Promise<Response>((resolve, reject) => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      reject(new BlockedHostError(url.hostname));
      return;
    }
    // Node skips `lookup` for IP literals, so check those up front.
    if (isIpLiteral(url.hostname) && isBlockedAddress(url.hostname)) {
      reject(new BlockedHostError(url.hostname));
      return;
    }
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(
      url,
      {
        method: 'GET',
        lookup: guardedLookup as never,
        signal: init.signal,
        headers: { 'user-agent': 'DevDigest-skill-import', accept: 'text/markdown, text/plain, */*' },
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
