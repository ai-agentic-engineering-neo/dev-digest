import { describe, it, expect } from 'vitest';
import { fetchPublicUrl, isBlockedAddress, BlockedHostError } from '../src/platform/public-fetch.js';

/** S7 — a user-supplied URL must never reach loopback/private/metadata addresses. */
describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '::1', '[::1]', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fd00::1', 'fe80::1', 'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '140.82.112.3', '2606:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('fetchPublicUrl — refused before any connection', () => {
  const signal = () => AbortSignal.timeout(5_000);

  it.each([
    'http://example.com/skill.md',
    'https://user:pass@example.com/skill.md',
    'https://localhost/skill.md',
    'https://api.localhost/skill.md',
    'https://127.0.0.1/skill.md',
    'https://[::1]/skill.md',
    'https://[::ffff:127.0.0.1]/skill.md',
    'https://169.254.169.254/latest/meta-data',
  ])('%s', async (url) => {
    await expect(fetchPublicUrl(url, signal())).rejects.toBeInstanceOf(BlockedHostError);
  });
});
