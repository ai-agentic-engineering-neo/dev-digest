import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { extractJson, parseWithRepair } from '../src/index.js';

describe('extractJson', () => {
  it('returns the body of a ```json fence', () => {
    expect(extractJson('here:\n```json\n{"a":1}\n```\nbye')).toBe('{"a":1}');
  });
  it('accepts an unlabelled fence', () => {
    expect(extractJson('```\n[1,2]\n```')).toBe('[1,2]');
  });
  it('cuts the first balanced object out of surrounding prose', () => {
    expect(extractJson('Sure! {"a":{"b":2}} hope it helps {"c":3}')).toBe('{"a":{"b":2}}');
  });
  it('picks whichever of { or [ comes first', () => {
    expect(extractJson('x [1,{"a":2}] y')).toBe('[1,{"a":2}]');
    expect(extractJson('x {"a":[1]} y')).toBe('{"a":[1]}');
  });
  it('returns the tail when the JSON is unbalanced (truncated output)', () => {
    expect(extractJson('prefix {"a":{"b":1}')).toBe('{"a":{"b":1}');
  });
  it('returns trimmed text unchanged when there is no JSON at all', () => {
    expect(extractJson('  no json here  ')).toBe('no json here');
  });
});

describe('parseWithRepair', () => {
  const Schema = z.object({ ok: z.boolean(), n: z.number().int() });

  it('parses strict pure JSON', () => {
    expect(parseWithRepair(Schema, ' {"ok":true,"n":1} ')).toEqual({ ok: true, data: { ok: true, n: 1 } });
  });

  it('prefers direct JSON.parse so braces/fences inside strings are not mis-extracted', () => {
    const S = z.object({ body: z.string() });
    const raw = JSON.stringify({ body: 'use ```ts\nconst x = {a:1}\n``` here' });
    const r = parseWithRepair(S, raw);
    expect(r.ok && r.data.body).toContain('const x = {a:1}');
  });

  it('falls back to fence extraction for prose-wrapped output', () => {
    const r = parseWithRepair(Schema, 'Result:\n```json\n{"ok":false,"n":2}\n```');
    expect(r).toEqual({ ok: true, data: { ok: false, n: 2 } });
  });

  it('invalid JSON → not-ok with a reprompt asking for JSON only', () => {
    const r = parseWithRepair(Schema, 'totally not json');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/^Output was not valid JSON/);
    expect(r.repromptMessage).toContain('Return ONLY a single valid JSON object');
  });

  it('schema mismatch → issues listed with paths (root for top-level)', () => {
    const r = parseWithRepair(Schema, '{"ok":"yes","n":1.5}');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('- ok:');
    expect(r.error).toContain('- n:');
    expect(r.repromptMessage).toContain('did not match the required schema');
    const root = parseWithRepair(Schema, '[]');
    expect(!root.ok && root.error).toContain('(root)');
  });
});
