import { describe, it, expect } from 'vitest';
import { containsSecretShapedValue, containsKnownSecretValue, findSecretShapedString } from './redact.js';

/**
 * specs/14-export-to-ci.md (P2/P4, security-critical) — the shared guard used
 * by both `bundle.ts` (AC-15/AC-55, before generation ever leaves the
 * server) and `ingest.ts` (AC-63, before an ingested document is persisted).
 */

describe('containsSecretShapedValue', () => {
  it.each([
    ['an OpenAI/OpenRouter-style key', 'the key is sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'],
    ['a classic GitHub PAT', 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789012'],
    ['a fine-grained GitHub PAT', 'export GITHUB_TOKEN=github_pat_ABCDEFGHIJKLMNOPQRSTUVWX'],
    ['an AWS access key id', 'AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP'],
    ['a PEM private key header', '-----BEGIN RSA PRIVATE KEY-----\nMIIEow...'],
    ['a long base64 value assigned to a "secret" field', 'secret: "AbCdEf0123456789AbCdEf0123456789=="'],
    ['a long value assigned to a "token" field with =', 'token=Zm9vYmFyYmF6cXV1eGNvcmdlZ3JhdWx0MTIz'],
  ])('flags %s', (_label, text) => {
    expect(containsSecretShapedValue(text)).toBe(true);
  });

  it.each([
    ['ordinary prose', 'This PR adds rate limiting to the public API endpoints.'],
    ['a short, non-credential-shaped word after "key"', 'key: value'],
    ['a UUID (not credential-shaped)', 'id: 5b1f7c2a-3e4d-4a9b-8c1e-2f3a4b5c6d7e'],
    ['code that merely mentions the word secret without assigning a long value', 'do not log any secret to stdout'],
  ])('does not flag %s', (_label, text) => {
    expect(containsSecretShapedValue(text)).toBe(false);
  });
});

describe('containsKnownSecretValue', () => {
  it('flags text containing a configured known secret value verbatim', () => {
    expect(containsKnownSecretValue('the value is abc123-real-secret-value', ['abc123-real-secret-value'])).toBe(
      true,
    );
  });

  it('does not flag text that contains none of the known values', () => {
    expect(containsKnownSecretValue('nothing sensitive here', ['abc123-real-secret-value'])).toBe(false);
  });

  it('skips undefined/blank candidate values rather than treating them as a universal match', () => {
    expect(containsKnownSecretValue('any text at all', [undefined, '', '   '])).toBe(false);
  });

  it('matches against ANY of several known values', () => {
    expect(
      containsKnownSecretValue('contains value-two somewhere', ['value-one', 'value-two', undefined]),
    ).toBe(true);
  });
});

describe('findSecretShapedString', () => {
  it('finds a secret-shaped string nested inside an object', () => {
    const value = { agent: 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', other: 'fine' };
    expect(findSecretShapedString(value)).toBe(value.agent);
  });

  it('finds a secret-shaped string nested inside an array', () => {
    const value = ['fine', 'also fine', 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
    expect(findSecretShapedString(value)).toBe(value[2]);
  });

  it('returns null when nothing in the tree is secret-shaped', () => {
    const value = { a: 'fine', b: { c: ['fine', 'also fine'] } };
    expect(findSecretShapedString(value)).toBeNull();
  });

  it('returns null for non-string primitives', () => {
    expect(findSecretShapedString(42)).toBeNull();
    expect(findSecretShapedString(null)).toBeNull();
    expect(findSecretShapedString(undefined)).toBeNull();
  });
});
