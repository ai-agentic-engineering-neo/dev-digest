import { describe, it, expect } from 'vitest';
import {
  defaultSkillDescription,
  evidenceRef,
  renderConventionsSkill,
} from '../src/modules/conventions/render-skill.js';
import type { ConventionCandidate } from '@devdigest/shared';

/**
 * What a generated skill says is what an agent will be told to enforce, so the
 * body is worth pinning: the rules that made it in, the citations beside them,
 * and — most of all — that nothing the user refused can appear.
 */

const candidate = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: 'c1',
  repo_id: 'r1',
  rule: 'Always use async/await instead of .then() chains.',
  category: 'async',
  status: 'accepted',
  confidence: 0.91,
  evidence_path: 'src/api/users.ts',
  evidence_line_start: 23,
  evidence_line_end: 24,
  evidence_snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany();',
  evidence_sha: 'abc1234def',
  scan_id: 's1',
  skill_id: null,
  created_at: '2026-09-22T10:00:00.000Z',
  updated_at: '2026-09-22T10:00:00.000Z',
  ...over,
});

describe('conventions skill rendering', () => {
  it('states where the rules came from, so the reader can judge them', () => {
    const body = renderConventionsSkill({
      name: 'repo-conventions',
      repoFullName: 'acme/payments-api',
      headSha: 'abc1234def5678',
      sampleCount: 14,
      scannedOn: '2026-09-22',
      candidates: [candidate()],
    });
    expect(body).toContain('# repo-conventions');
    expect(body).toContain('`acme/payments-api`');
    expect(body).toContain('14 sampled files');
    expect(body).toContain('`abc1234`');
    expect(body).toContain('2026-09-22');
  });

  it('carries the rule, its citation and the real code under a category heading', () => {
    const body = renderConventionsSkill({
      name: 'repo-conventions',
      repoFullName: 'acme/payments-api',
      headSha: null,
      sampleCount: 3,
      scannedOn: null,
      candidates: [candidate()],
    });
    expect(body).toContain('## Async');
    expect(body).toContain('- **Always use async/await instead of .then() chains.**');
    expect(body).toContain('`src/api/users.ts:23-24`');
    expect(body).toContain('const user = await db.users.find(id);');
  });

  it('carries the model\'s rationale as a Why line, so the agent knows how far the rule reaches', () => {
    const body = renderConventionsSkill({
      name: 'repo-conventions',
      repoFullName: 'acme/payments-api',
      headSha: null,
      sampleCount: 3,
      scannedOn: null,
      candidates: [candidate({ rationale: 'Used in 41 of 44 async\n  functions.' })],
    });
    expect(body).toContain('  Why: Used in 41 of 44 async functions.');
    expect(body.indexOf('Why:')).toBeLessThan(body.indexOf('Evidence:'));
  });

  it('omits the Why line when the model gave no rationale', () => {
    const body = renderConventionsSkill({
      name: 'repo-conventions',
      repoFullName: 'acme/payments-api',
      headSha: null,
      sampleCount: 3,
      scannedOn: null,
      candidates: [candidate({ rationale: null })],
    });
    expect(body).not.toContain('Why:');
  });

  it('groups by category in a fixed order', () => {
    const body = renderConventionsSkill({
      name: 'repo-conventions',
      repoFullName: 'acme/payments-api',
      headSha: null,
      sampleCount: 3,
      scannedOn: null,
      candidates: [
        candidate({ id: 'a', category: 'testing', rule: 'Tests name the condition.' }),
        candidate({ id: 'b', category: 'structure', rule: 'Data access lives in repository.ts.' }),
      ],
    });
    expect(body.indexOf('## Structure')).toBeLessThan(body.indexOf('## Testing'));
  });

  it('renders only the candidates it is given — the rejected ones never reach it', () => {
    // The service refuses a non-accepted id with a 422; this asserts the other
    // half of that guarantee, that the renderer adds nothing of its own.
    const body = renderConventionsSkill({
      name: 'repo-conventions',
      repoFullName: 'acme/payments-api',
      headSha: null,
      sampleCount: 3,
      scannedOn: null,
      candidates: [candidate({ id: 'kept', rule: 'Kept rule.' })],
    });
    expect(body).toContain('Kept rule.');
    expect(body).not.toContain('Refused rule.');
  });

  it('clamps a long snippet rather than pasting a whole function', () => {
    const long = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
    const body = renderConventionsSkill({
      name: 'repo-conventions',
      repoFullName: 'acme/payments-api',
      headSha: null,
      sampleCount: 3,
      scannedOn: null,
      candidates: [candidate({ evidence_snippet: long })],
    });
    expect(body).toContain('line 8');
    expect(body).not.toContain('line 9');
    expect(body).toContain('…');
  });

  it('escapes a snippet that contains a fence, so the markdown survives it', () => {
    const body = renderConventionsSkill({
      name: 'repo-conventions',
      repoFullName: 'acme/payments-api',
      headSha: null,
      sampleCount: 1,
      scannedOn: null,
      // A real run of three backticks inside the quoted code.
      candidates: [candidate({ evidence_snippet: 'const fence = "```ts";' })],
    });
    expect(body).toContain('````\nconst fence = "```ts";\n````');
  });
});

describe('conventions skill metadata', () => {
  it('writes a single-line citation when the evidence is one line', () => {
    expect(
      evidenceRef({ evidence_path: 'src/a.ts', evidence_line_start: 7, evidence_line_end: 7 }),
    ).toBe('src/a.ts:7');
  });

  it('describes the skill directively and counts the rules inside it', () => {
    expect(defaultSkillDescription('acme/payments-api', 3)).toBe(
      'Flags changes that violate the 3 house conventions extracted from acme/payments-api, citing the offending file:line.',
    );
    expect(defaultSkillDescription('acme/payments-api', 1)).toContain('1 house convention extracted');
  });
});
