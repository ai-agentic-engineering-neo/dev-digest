import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findingFingerprint, groundFindings, locateQuote } from './lib/grounding.mjs';

const lines = [
  "import { db } from '../../db/client.js';", // 1
  '', // 2
  'export async function listPulls(repoId: string) {', // 3
  '  const rows = await db.select().from(pulls).where(eq(pulls.repoId, repoId));', // 4
  '  return rows;', // 5
  '}', // 6
];

test('locateQuote: exact line, nearby line, far line, missing', () => {
  assert.equal(locateQuote(lines, 'const rows = await db.select()', 4), 4);
  assert.equal(locateQuote(lines, 'const rows = await db.select()', 7), 4); // off by 3 → corrected
  assert.equal(locateQuote(lines, "import { db } from '../../db/client.js';", 40), 1); // relocated via whole-file search
  assert.equal(locateQuote(lines, 'this code does not exist anywhere', 4), null);
});

test('locateQuote: short quotes only match exactly at the reported line', () => {
  assert.equal(locateQuote(lines, '}', 6), 6);
  assert.equal(locateQuote(lines, '}', 1), null);
});

const ctx = (ranges) => ({
  bucketFiles: new Map([
    ['onion-architecture', new Set(['a.ts'])],
    ['security', new Set(['a.ts'])],
  ]),
  linesOf: () => lines,
  rangesOf: () => ranges,
});
const f = (extra) => ({
  bucket: 'onion-architecture',
  skill: 'onion-architecture',
  file: 'a.ts',
  line: 4,
  quote: 'const rows = await db.select().from(pulls)',
  severity: 'WARNING',
  title: 'Route queries db',
  why: '…',
  fix: '…',
  ...extra,
});

test('new vs pre-existing by changed ranges', () => {
  const onChanged = groundFindings([f()], ctx([[3, 5]]));
  assert.equal(onChanged.findings.length, 1);
  assert.equal(onChanged.pre_existing.length, 0);
  const offChanged = groundFindings([f()], ctx([[1, 1]]));
  assert.equal(offChanged.findings.length, 0);
  assert.equal(offChanged.pre_existing.length, 1);
});

test('ungrounded, invalid severity, out-of-bucket and incomplete findings are dropped', () => {
  const r = groundFindings(
    [
      f({ quote: 'hallucinated code line here' }),
      f({ severity: 'BLOCKER' }),
      f({ file: 'b.ts' }),
      f({ title: '' }),
    ],
    ctx([[1, 6]]),
  );
  assert.equal(r.findings.length, 0);
  assert.deepEqual(
    r.dropped.map((d) => d.dropped_reason.split(':')[0]),
    ['ungrounded', 'invalid severity "BLOCKER"', 'file outside the bucket that reported it', 'missing fields'],
  );
});

test('same line from two skills merges, highest severity wins', () => {
  const r = groundFindings(
    [f(), f({ bucket: 'security', skill: 'security', severity: 'CRITICAL', title: 'Unscoped query leaks rows' })],
    ctx([[1, 6]]),
  );
  assert.equal(r.findings.length, 1);
  const [m] = r.findings;
  assert.equal(m.severity, 'CRITICAL');
  assert.equal(m.title, 'Unscoped query leaks rows');
  assert.deepEqual(m.skills.sort(), ['onion-architecture', 'security']);
  assert.equal(m.fingerprints.length, 2);
  assert.equal(m.id, 'F001');
});

test('fingerprint ignores wording and whitespace, depends on skill/file/quote', () => {
  assert.equal(findingFingerprint('s', 'a.ts', '  const  x = 1 '), findingFingerprint('s', 'a.ts', 'const x = 1'));
  assert.notEqual(findingFingerprint('s', 'a.ts', 'const x = 1'), findingFingerprint('t', 'a.ts', 'const x = 1'));
});
