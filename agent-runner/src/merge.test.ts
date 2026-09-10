import { describe, it, expect } from 'vitest';
import { mergeAgentReviews, type AgentPayload } from './merge.js';

/**
 * The posted body is the first thing a reviewer sees on the PR. It must stay
 * SHORT: every finding is already annotated on the line it refers to, so
 * repeating all of them at the top turned a 44-finding run into a page of
 * scrollback before the diff (burnjohn/quick-blog#31).
 */

function agent(overrides: Partial<AgentPayload> = {}): AgentPayload {
  return {
    agent: 'General Reviewer',
    payload: {
      body: '## General Reviewer — Changes requested\n\n- 🔴 **Leaky config** (critical, security) — `a.ts:1`',
      event: 'REQUEST_CHANGES',
      comments: [{ path: 'a.ts', line: 1, body: '**Leaky config** (critical)' }],
    },
    gateTriggered: true,
    blockers: 1,
    findingsCount: 1,
    counts: { critical: 1, warning: 0, suggestion: 0 },
    ...overrides,
  };
}

describe('mergeAgentReviews body', () => {
  it('leads with totals and keeps every finding list collapsed', () => {
    const { payload } = mergeAgentReviews([
      agent(),
      agent({
        agent: 'Spec Conformance Reviewer',
        findingsCount: 3,
        counts: { critical: 0, warning: 3, suggestion: 0 },
        gateTriggered: false,
        blockers: 0,
        payload: { body: '## Spec Conformance Reviewer\n\n- 🟡 **AC-1 diverged** (warning, bug) — `b.ts:2`', event: 'COMMENT' },
      }),
    ]);

    // The visible part: who ran and how much they found — nothing else.
    const visible = payload.body.split('<details>')[0]!;
    expect(visible).toContain('DevDigest — 2 reviewers');
    expect(visible).toContain('**4 findings** · 1 critical · 3 warning · 0 suggestion');
    expect(visible).not.toContain('Leaky config');
    expect(visible).not.toContain('AC-1 diverged');

    // Nothing is lost — each agent's list is one click away. Kept rather than
    // summarised because a finding the diff could not anchor exists ONLY here.
    expect(payload.body.match(/<details>/g)).toHaveLength(2);
    expect(payload.body).toContain('Leaky config');
    expect(payload.body).toContain('AC-1 diverged');

    // Markdown inside <details> only renders with the surrounding blank lines.
    expect(payload.body).toMatch(/<summary>[^\n]*<\/summary>\n\n/);
    expect(payload.body).toMatch(/\n\n<\/details>/);
  });

  it('names the single reviewer in the title instead of counting to one', () => {
    const { payload } = mergeAgentReviews([agent()]);
    expect(payload.body).toContain('## DevDigest — General Reviewer');
    expect(payload.body).not.toContain('1 reviewers');
  });

  it('says so plainly when nothing was found, and still lists who looked', () => {
    const clean = agent({
      findingsCount: 0,
      counts: { critical: 0, warning: 0, suggestion: 0 },
      gateTriggered: false,
      blockers: 0,
      payload: { body: '## General Reviewer — Approved ✅', event: 'APPROVE' },
    });
    const { payload } = mergeAgentReviews([clean]);
    expect(payload.body).toContain('_No findings. Looks good._');
    expect(payload.body).toContain('✅ General Reviewer');
    expect(payload.event).toBe('APPROVE');
  });
});
