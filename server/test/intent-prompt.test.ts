/**
 * L03 — `describeClassifierPrompt` / `buildUserPrompt` (modules/intent/prompt.ts).
 * Pure: text-free section metadata for the intent classifier's prompt, plus the
 * byte-identical guarantee on `buildUserPrompt`'s actual LLM-bound text.
 */
import { describe, it, expect } from 'vitest';
import {
  describeClassifierPrompt,
  buildUserPrompt,
  SYSTEM_PROMPT,
  type ClassifierSource,
} from '../src/modules/intent/prompt.js';

const PR = { number: 42, owner: 'acme', repo: 'widgets' };

const SOURCES: ClassifierSource[] = [
  { kind: 'linked_spec', ref: 'docs/specs/rl.md', text: 'CANARY_SPEC_6', truncated: false },
  { kind: 'linked_issue', ref: '#12', text: 'CANARY_ISSUE_7', truncated: false },
  { kind: 'title', ref: 'CANARY_TITLE_8', text: 'CANARY_TITLE_8', truncated: false },
  { kind: 'branch', ref: 'feat/CANARY_BRANCH_9', text: 'feat/CANARY_BRANCH_9', truncated: false },
];

describe('describeClassifierPrompt', () => {
  it('describes one section per source, with sizes and allowlisted refs only', () => {
    const result = describeClassifierPrompt(PR, SOURCES);

    expect(result.sections.map((s) => s.name)).toEqual([
      'system_prompt',
      'header',
      'S1',
      'S2',
      'S3',
      'S4',
    ]);
    expect(result.system_chars).toBe(SYSTEM_PROMPT.length);

    // header + S1..S4 are the "user" sections; the join separator is '\n\n'
    // (2 chars) between each of them — same arithmetic as assemblePrompt's.
    const userSections = result.sections.slice(1);
    const userSum = userSections.reduce((n, s) => n + s.chars, 0) + 2 * (userSections.length - 1);
    expect(userSum).toBe(buildUserPrompt(PR, SOURCES).length);

    // linked_spec / linked_issue are in LOGGABLE_REF_KINDS → their ref is kept.
    expect(result.sections[2]!.ref).toBe('docs/specs/rl.md');
    expect(result.sections[3]!.ref).toBe('#12');
    // title / branch refs ARE the author's own text → always null.
    expect(result.sections[4]!.ref).toBeNull();
    expect(result.sections[5]!.ref).toBeNull();

    // Text-free: none of the sources' bodies (nor the title/branch text used
    // as their `ref`) leaks into the returned metadata.
    expect(JSON.stringify(result)).not.toMatch(
      /CANARY_(SPEC_6|ISSUE_7|TITLE_8|BRANCH_9)/,
    );
  });

  it('attaches a fingerprint per section only when a hasher is supplied', () => {
    const withHash = describeClassifierPrompt(PR, SOURCES, { fingerprint: (t) => `h${t.length}` });
    for (const s of withHash.sections) {
      expect(s.fingerprint).toBe(`h${s.chars}`);
    }

    const withoutHash = describeClassifierPrompt(PR, SOURCES);
    for (const s of withoutHash.sections) {
      expect(s.fingerprint).toBeUndefined();
    }
  });
});

describe('buildUserPrompt — byte-identical rendering', () => {
  it('renders "PR #N in owner/repo" + one wrapped block per source, joined by blank lines', () => {
    const pr = { number: 7, owner: 'acme', repo: 'widgets' };
    const sources: ClassifierSource[] = [
      { kind: 'description', ref: 'pr-body', text: 'Adds caching.', truncated: false },
    ];

    const expected =
      'PR #7 in acme/widgets\n\n' +
      '### S1 · description · pr-body\n' +
      '<untrusted source="intent-S1">\n' +
      'Adds caching.\n' +
      '</untrusted>';

    expect(buildUserPrompt(pr, sources)).toBe(expected);
  });

  it('marks a truncated source in its block label', () => {
    const pr = { number: 1, owner: 'a', repo: 'b' };
    const sources: ClassifierSource[] = [
      { kind: 'commits', ref: 'commits', text: 'c1\nc2', truncated: true },
    ];
    expect(buildUserPrompt(pr, sources)).toContain('### S1 · commits · commits (truncated)');
  });
});
