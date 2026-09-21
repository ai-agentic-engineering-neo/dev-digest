import { describe, it, expect } from 'vitest';
import { isPublicAddress, SsrfSafeWebFetcher } from '../src/adapters/webfetch/safe-fetch.js';

/**
 * The address guard for skill-import-by-URL. These cases are the difference
 * between "fetch a markdown file" and "turn the API into a proxy for whatever
 * private network it happens to run in", so they are worth pinning precisely.
 *
 * No network: the scheme/credential checks run before any DNS or fetch, and the
 * address classifier is pure.
 */

describe('isPublicAddress — IPv4', () => {
  it.each([
    ['8.8.8.8'],
    ['1.1.1.1'],
    ['93.184.216.34'],
    ['172.15.0.1'], // just below the private 172.16/12 block
    ['172.32.0.1'], // just above it
  ])('allows the public address %s', (addr) => {
    expect(isPublicAddress(addr, 4)).toBe(true);
  });

  it.each([
    ['127.0.0.1', 'loopback'],
    ['0.0.0.0', 'this network'],
    ['10.1.2.3', 'private'],
    ['172.16.0.1', 'private, low edge'],
    ['172.31.255.255', 'private, high edge'],
    ['192.168.1.1', 'private'],
    ['169.254.169.254', 'cloud metadata'],
    ['100.64.0.1', 'CGNAT'],
    ['198.18.0.1', 'benchmarking'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
  ])('refuses %s (%s)', (addr) => {
    expect(isPublicAddress(addr, 4)).toBe(false);
  });

  it('refuses a malformed address rather than defaulting to allow', () => {
    expect(isPublicAddress('not-an-ip', 4)).toBe(false);
    expect(isPublicAddress('999.1.1.1', 4)).toBe(false);
  });
});

describe('isPublicAddress — IPv6', () => {
  it('allows a public v6 address', () => {
    expect(isPublicAddress('2606:4700:4700::1111', 6)).toBe(true);
  });

  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fc00::1', 'unique-local'],
    ['fd12:3456::1', 'unique-local'],
    ['fe80::1', 'link-local'],
    ['ff02::1', 'multicast'],
  ])('refuses %s (%s)', (addr) => {
    expect(isPublicAddress(addr, 6)).toBe(false);
  });

  it('judges an IPv4-mapped address by its inner v4 — the classic bypass', () => {
    expect(isPublicAddress('::ffff:127.0.0.1', 6)).toBe(false);
    expect(isPublicAddress('::ffff:169.254.169.254', 6)).toBe(false);
    expect(isPublicAddress('::ffff:8.8.8.8', 6)).toBe(true);
  });

  it('ignores a zone index when classifying', () => {
    expect(isPublicAddress('fe80::1%eth0', 6)).toBe(false);
  });
});

describe('SsrfSafeWebFetcher.fetchText — pre-flight checks', () => {
  const fetcher = new SsrfSafeWebFetcher();

  it.each([
    ['file:///etc/passwd'],
    ['ftp://example.com/skill.md'],
    ['data:text/markdown,hello'],
    ['gopher://example.com/'],
  ])('refuses the non-http scheme in %s', async (url) => {
    await expect(fetcher.fetchText(url)).rejects.toThrow(/Only http and https/);
  });

  it('refuses embedded credentials', async () => {
    await expect(fetcher.fetchText('https://user:pass@example.com/s.md')).rejects.toThrow(
      /embedded credentials/,
    );
  });

  it('refuses a string that is not a URL at all', async () => {
    await expect(fetcher.fetchText('not a url')).rejects.toThrow(/not a valid URL/);
  });

  it('refuses a hostname that resolves to loopback', async () => {
    // `localhost` resolves locally, so this exercises the DNS branch without
    // reaching the network.
    await expect(fetcher.fetchText('http://localhost/skill.md')).rejects.toThrow(
      /private or loopback/,
    );
  });

  it('refuses a literal private address', async () => {
    await expect(fetcher.fetchText('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /private or loopback/,
    );
  });
});
