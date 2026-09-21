import { lookup } from 'node:dns/promises';
import type { FetchedDocument, WebFetcher } from '@devdigest/shared';

/**
 * `WebFetcher` over the platform `fetch`, hardened for URLs the USER typed.
 *
 * The skill importer lets someone paste an arbitrary address and have THIS
 * SERVER request it. That is a textbook SSRF sink: without guards it turns the
 * API into a proxy for the private network it happens to sit in (the metadata
 * endpoint, a Docker-internal Postgres, the host's own admin ports). Every
 * guarantee therefore lives here, once, instead of at each call site.
 *
 * Guards, in the order they run:
 *  1. Scheme allowlist — http/https only (no `file:`, `ftp:`, `data:`, `gopher:`).
 *  2. No embedded credentials — `http://user:pass@host` is refused outright.
 *  3. DNS resolution + address check — EVERY address the hostname resolves to
 *     must be a public unicast address. One private answer refuses the fetch.
 *  4. Redirects refused (`redirect: 'manual'`) — a 302 to 169.254.169.254 would
 *     otherwise sail straight past guard 3, which only ever saw the first host.
 *  5. Hard timeout, so a hanging peer can't pin a request handler open.
 *  6. Content-type allowlist + streamed size cap — a skill is a small markdown
 *     document; anything else is refused before it is buffered into memory.
 *
 * Residual risk, accepted deliberately: DNS rebinding. Guard 3 resolves the name
 * and `fetch` resolves it again, so a hostile resolver could answer differently
 * the second time. Closing that needs a custom agent that connects to the
 * already-validated IP while preserving SNI/Host. For a local-first tool whose
 * operator is also its only user, the cost outweighs the benefit — but do not
 * reuse this adapter for a multi-tenant deployment without fixing it.
 */

/** Wall-clock budget for the whole request. */
const FETCH_TIMEOUT_MS = 8_000;

/** Hard cap on the response body. A skill is prose, not a payload. */
const MAX_BYTES = 256 * 1024;

/**
 * Response content types we will read. Markdown is served under a depressing
 * variety of types, and plenty of raw-file hosts fall back to octet-stream, so
 * the list is broad — but it still excludes html/json/binary, which are not
 * skills and whose presence means the URL pointed at the wrong thing.
 */
const ALLOWED_CONTENT_TYPES = [
  'text/markdown',
  'text/x-markdown',
  'text/plain',
  'application/markdown',
  'application/octet-stream',
];

export class SsrfSafeWebFetcher implements WebFetcher {
  async fetchText(rawUrl: string): Promise<FetchedDocument> {
    const url = parseHttpUrl(rawUrl);
    await assertPublicHost(url.hostname);

    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: ALLOWED_CONTENT_TYPES.join(', ') },
      });
    } catch (err) {
      // Includes the timeout abort. The URL is echoed back but the underlying
      // error text is not, so we don't turn failures into a network oracle.
      throw new Error(`Could not fetch ${url.href}: ${(err as Error).name}`);
    }

    // `redirect: 'manual'` surfaces 3xx as an ordinary response rather than
    // following it. Refuse instead of chasing: the new host was never checked.
    if (res.status >= 300 && res.status < 400) {
      throw new Error(
        `Refused to follow a redirect from ${url.href} — fetch the final URL directly.`,
      );
    }
    if (!res.ok) throw new Error(`Fetch failed with HTTP ${res.status} for ${url.href}`);

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    const mime = contentType.split(';')[0]!.trim();
    if (mime && !ALLOWED_CONTENT_TYPES.includes(mime)) {
      throw new Error(
        `Unsupported content type "${mime}" — a skill must be a markdown or plain-text document.`,
      );
    }

    // Declared length is a hint, not a promise: check it to fail early, then
    // enforce the real cap while reading.
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_BYTES) {
      throw new Error(`Document is too large (${declared} bytes; limit ${MAX_BYTES}).`);
    }

    const text = await readCapped(res, MAX_BYTES);
    return { url: url.href, contentType: mime, text };
  }
}

/** Parse + scheme/credential check. Throws with a user-facing message. */
function parseHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`"${raw}" is not a valid URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Only http and https URLs can be imported (got "${url.protocol}").`);
  }
  if (url.username || url.password) {
    throw new Error('URLs with embedded credentials are not allowed.');
  }
  return url;
}

/**
 * Resolve `hostname` and refuse if ANY answer is non-public. Checking every
 * answer (not just the first) matters: a hostile name can return one public and
 * one private address and let the client pick.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error(`Could not resolve host "${hostname}".`);
  }
  if (addresses.length === 0) throw new Error(`Could not resolve host "${hostname}".`);

  for (const { address, family } of addresses) {
    if (!isPublicAddress(address, family)) {
      throw new Error(
        `Refusing to fetch "${hostname}" — it resolves to a private or loopback address.`,
      );
    }
  }
}

/** True only for addresses that are safe to send a server-side request to. */
export function isPublicAddress(address: string, family: number): boolean {
  if (family === 4) return isPublicIpv4(address);

  const addr = address.toLowerCase().split('%')[0]!; // strip any zone index

  // IPv4-mapped / IPv4-compatible v6 (::ffff:10.0.0.1) — judge the inner v4.
  const mapped = addr.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]!);

  if (addr === '::' || addr === '::1') return false; // unspecified / loopback
  if (/^f[cd]/.test(addr)) return false; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(addr)) return false; // fe80::/10 link-local
  if (/^ff/.test(addr)) return false; // ff00::/8 multicast
  return true;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return false; // 0.0.0.0/8 "this network"
  if (a === 10) return false; // private
  if (a === 127) return false; // loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64/10 CGNAT
  if (a === 169 && b === 254) return false; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 0) return false; // 192.0.0/24 IETF protocol assignments
  if (a === 192 && b === 168) return false; // private
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
}

/**
 * Read the body as UTF-8, aborting once `max` bytes have arrived. Streaming
 * rather than `res.text()` so a peer that lies about content-length (or omits
 * it) still can't make us buffer an unbounded response.
 */
async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        throw new Error(`Document is too large (limit ${max} bytes).`);
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return new TextDecoder('utf-8').decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
