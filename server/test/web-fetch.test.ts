import { describe, it, expect } from 'vitest';
import {
  HttpWebFetchClient,
  WebFetchError,
  pinnedLookup,
  type FetchResponse,
  type LookupFn,
  type RequestFn,
  type ResolvedAddress,
} from '../src/adapters/http/web-fetch.js';

// ---------- test helpers (no network: everything goes through `lookup` / `request`) ----------

const PUBLIC_ADDR: ResolvedAddress = { address: '93.184.216.34', family: 4 };
const PRIVATE_ADDR: ResolvedAddress = { address: '10.0.0.5', family: 4 };
const LOOPBACK_ADDR: ResolvedAddress = { address: '127.0.0.1', family: 4 };

/** A single-answer lookup that always resolves to `addr`. */
function lookupTo(...addrs: ResolvedAddress[]): LookupFn {
  return async () => addrs;
}

async function* bodyOf(text: string): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode(text);
}

function okResponse(text: string, contentType = 'text/markdown'): FetchResponse {
  return {
    statusCode: 200,
    headers: { 'content-type': contentType },
    body: bodyOf(text),
    dispose() {
      /* no-op */
    },
  };
}

function redirectResponse(location: string, status = 302): FetchResponse {
  return {
    statusCode: status,
    headers: { location },
    body: bodyOf(''),
    dispose() {
      /* no-op */
    },
  };
}

/** A `request` seam that never resolves — fails the test loudly if the SSRF gate lets it through. */
const requestMustNotBeCalled: RequestFn = async () => {
  throw new Error('request() must not be called — the SSRF gate should reject before any network call');
};

describe('HttpWebFetchClient (SSRF-guarded, hermetic via lookup/request seams)', () => {
  it('happy path: a public https URL serving text/markdown returns ok with the body', async () => {
    const request: RequestFn = async ({ url }) => {
      expect(url.href).toBe('https://example.com/doc.md');
      return okResponse('# hello world');
    };
    const client = new HttpWebFetchClient({ lookup: lookupTo(PUBLIC_ADDR), request });

    const result = await client.fetchText('https://example.com/doc.md');

    expect(result).toEqual({
      text: '# hello world',
      status: 'ok',
      contentType: 'text/markdown',
      finalUrl: 'https://example.com/doc.md',
    });
  });

  describe('private IP rejection', () => {
    it('rejects a host that resolves to a private address among public and loopback ones, before any request', async () => {
      const lookup = lookupTo(PUBLIC_ADDR, PRIVATE_ADDR, LOOPBACK_ADDR);
      const client = new HttpWebFetchClient({ lookup, request: requestMustNotBeCalled });

      await expect(client.fetchText('https://mixed.example.com/doc.md')).rejects.toMatchObject({
        name: 'WebFetchError',
        code: 'blocked_host',
      });
    });

    it('rejects an IPv4-mapped IPv6 metadata address (::ffff:169.254.169.254)', async () => {
      const lookup = lookupTo({ address: '::ffff:169.254.169.254', family: 6 });
      const client = new HttpWebFetchClient({ lookup, request: requestMustNotBeCalled });

      await expect(client.fetchText('https://metadata.example.com/doc.md')).rejects.toMatchObject({
        code: 'blocked_host',
      });
    });
  });

  it('pins the connect-time address to the one validated at the gate, even if a later lookup would answer private (DNS rebinding)', async () => {
    let lookupCalls = 0;
    // Simulate rebinding: the first (gate-time) answer is public; any later call would be private.
    const lookup: LookupFn = async () => {
      lookupCalls += 1;
      return lookupCalls === 1 ? [PUBLIC_ADDR] : [PRIVATE_ADDR];
    };
    let addressesSeenByRequest: ResolvedAddress[] | undefined;
    const request: RequestFn = async ({ addresses }) => {
      addressesSeenByRequest = addresses;
      return okResponse('pinned');
    };
    const client = new HttpWebFetchClient({ lookup, request });

    const result = await client.fetchText('https://rebind.example.com/doc.md');

    expect(result.status).toBe('ok');
    // Only the gate-time lookup happened, and its (public) result — not a later, private one — is
    // what the transport was told to connect to.
    expect(lookupCalls).toBe(1);
    expect(addressesSeenByRequest).toEqual([PUBLIC_ADDR]);
  });

  describe('pinnedLookup (the raw dns.lookup-shaped function wired into the undici Agent as connect.lookup)', () => {
    const ADDR_V6: ResolvedAddress = { address: '2001:db8::1', family: 6 };

    it('the options.all form calls back with exactly the validated list, whatever hostname connect asks for', () => {
      const lookup = pinnedLookup([PUBLIC_ADDR, ADDR_V6]);
      const calls: Array<[unknown, unknown, unknown]> = [];

      // The hostname argument is attacker-influenceable at connect time (rebinding); the pin must ignore it.
      lookup('attacker-controlled.example.com', { all: true }, (err, address, family) => {
        calls.push([err, address, family]);
      });

      expect(calls).toEqual([[null, [PUBLIC_ADDR, ADDR_V6], undefined]]);
    });

    it('the single-address form calls back with the first validated address and its own family', () => {
      // ADDR_V6 first, on purpose: a hardcoded family would still pass a family-4-first fixture.
      const lookup = pinnedLookup([ADDR_V6, PUBLIC_ADDR]);
      let seen: [unknown, unknown, unknown] | undefined;

      lookup('host', {}, (err, address, family) => {
        seen = [err, address, family];
      });

      expect(seen).toEqual([null, ADDR_V6.address, ADDR_V6.family]);
    });

    it('an empty validated list errors ENOTFOUND instead of falling through to real DNS', () => {
      const lookup = pinnedLookup([]);
      let seen: [unknown, unknown, unknown] | undefined;

      lookup('host', { all: true }, (err, address, family) => {
        seen = [err, address, family];
      });

      expect(seen?.[0]).toBeInstanceOf(Error);
      expect((seen?.[0] as NodeJS.ErrnoException).code).toBe('ENOTFOUND');
    });
  });

  describe('redirects', () => {
    it('re-validates a redirect target and rejects one that resolves to a private address', async () => {
      const lookup: LookupFn = async (hostname) =>
        hostname === 'internal.example.net' ? [PRIVATE_ADDR] : [PUBLIC_ADDR];
      let requestCalls = 0;
      const request: RequestFn = async () => {
        requestCalls += 1;
        return redirectResponse('https://internal.example.net/secret.md');
      };
      const client = new HttpWebFetchClient({ lookup, request });

      await expect(client.fetchText('https://example.com/start.md')).rejects.toMatchObject({
        code: 'blocked_host',
      });
      // The redirect hop was followed (one request) but never fetched — it was rejected at the gate.
      expect(requestCalls).toBe(1);
    });

    it('rejects more than 3 followed redirects (a 5th hop never happens)', async () => {
      let requestCalls = 0;
      const request: RequestFn = async () => {
        requestCalls += 1;
        return redirectResponse('https://example.com/loop.md');
      };
      const client = new HttpWebFetchClient({ lookup: lookupTo(PUBLIC_ADDR), request });

      await expect(client.fetchText('https://example.com/start.md')).rejects.toMatchObject({
        code: 'too_many_redirects',
      });
      // 3 followed redirects + the one that trips the cap = 4 requests, never a 5th.
      expect(requestCalls).toBe(4);
    });
  });

  it('caps the body at maxBytes and reports status: truncated', async () => {
    const long = 'x'.repeat(50);
    const request: RequestFn = async () => okResponse(long, 'text/plain');
    const client = new HttpWebFetchClient({ lookup: lookupTo(PUBLIC_ADDR), request });

    const result = await client.fetchText('https://example.com/big.txt', { maxBytes: 10 });

    expect(result.status).toBe('truncated');
    expect(Buffer.byteLength(result.text, 'utf-8')).toBeLessThanOrEqual(10);
  });

  describe('scheme / content-type gate', () => {
    it('rejects a non-https URL before resolving or requesting', async () => {
      const client = new HttpWebFetchClient({ lookup: lookupTo(PUBLIC_ADDR), request: requestMustNotBeCalled });

      await expect(client.fetchText('http://example.com/doc.md')).rejects.toMatchObject({
        code: 'blocked_scheme',
      });
    });

    it('throws unsupported_type for an HTML response', async () => {
      const request: RequestFn = async () => okResponse('<html></html>', 'text/html');
      const client = new HttpWebFetchClient({ lookup: lookupTo(PUBLIC_ADDR), request });

      await expect(client.fetchText('https://example.com/page.html')).rejects.toMatchObject({
        code: 'unsupported_type',
      });
    });
  });

  it('WebFetchError is thrown as an actual instance with a content-free message', async () => {
    const client = new HttpWebFetchClient({ lookup: lookupTo(PUBLIC_ADDR), request: requestMustNotBeCalled });

    try {
      await client.fetchText('http://example.com/doc.md');
      expect.unreachable('expected fetchText to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(WebFetchError);
      expect((err as WebFetchError).message).toBe('web_fetch_blocked_scheme');
    }
  });
});
