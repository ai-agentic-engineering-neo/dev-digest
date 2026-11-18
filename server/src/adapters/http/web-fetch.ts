import type { WebFetchClient } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { fetchPublicUrl, BlockedHostError } from '../../platform/public-fetch.js';

/**
 * SSRF-guarded outbound HTTP adapter.
 *
 * Guards enforced (identical to the original safeFetchSkillUrl in skills/routes.ts):
 *   - HTTPS-only (no plain http://, no data:, no javascript:)
 *   - Private/loopback/link-local IP hostnames blocked via regex
 *   - 10-second request timeout via AbortSignal.timeout
 *   - Response must have Content-Type starting with "text/"
 *   - Body capped at ~100KB
 *
 * S7 (security hardening): the hostname regex is only a fast pre-check. The
 * real guard is `fetchPublicUrl` — it checks every resolved address at
 * connect time (DNS rebinding, `localtest.me`, IPv6/IPv4-mapped literals) and
 * follows redirects by hand, re-validating each hop.
 */
export class WebFetchAdapter implements WebFetchClient {
  async fetch(url: string): Promise<string> {
    if (!url.startsWith('https://')) {
      throw new ValidationError('Only HTTPS URLs are allowed');
    }

    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      throw new ValidationError('Invalid URL');
    }

    const PRIVATE_IP =
      /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/;
    if (PRIVATE_IP.test(hostname)) {
      throw new ValidationError('Private and local URLs are not allowed');
    }

    let res: Response;
    try {
      res = await fetchPublicUrl(url, AbortSignal.timeout(10_000));
    } catch (err: unknown) {
      if (err instanceof BlockedHostError) {
      throw new ValidationError('Private and local URLs are not allowed');
    }
    const msg = err instanceof Error ? err.message : 'Network error';
      throw new ValidationError(`Failed to fetch URL: ${msg}`);
    }

    if (!res.ok) {
      throw new ValidationError(`URL returned HTTP ${res.status}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('text/')) {
      throw new ValidationError(
        'URL must return text content (text/plain or text/markdown)',
      );
    }

    const MAX_BYTES = 100_000;
    const reader = res.body?.getReader();
    if (!reader) throw new ValidationError('No response body');

    let total = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new ValidationError('File too large (max 100KB)');
      }
      chunks.push(value);
    }

    return new TextDecoder().decode(Buffer.concat(chunks));
  }
}
