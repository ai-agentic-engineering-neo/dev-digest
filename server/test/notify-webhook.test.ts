import { describe, it, expect } from 'vitest';
import { buildWebhookPayload } from '../src/modules/reviews/notify-webhook.js';

describe('buildWebhookPayload', () => {
  it('summarizes a clean review', () => {
    const p = buildWebhookPayload({
      prId: 'pr1',
      prTitle: 'Add rate limiting',
      agentName: 'General Reviewer',
      findingsCount: 0,
      verdict: 'approve',
    });
    expect(p.text).toBe('General Reviewer reviewed "Add rate limiting" — 0 finding(s).');
    expect(p.id.length).toBeGreaterThan(0);
  });

  it('uses "requested changes on" for a request_changes verdict', () => {
    const p = buildWebhookPayload({
      prId: 'pr2',
      prTitle: 'Add rate limiting',
      agentName: 'Security Reviewer',
      findingsCount: 3,
      verdict: 'request_changes',
    });
    expect(p.text).toBe('Security Reviewer requested changes on "Add rate limiting" — 3 finding(s).');
  });

  it('gives each payload a unique id', () => {
    const event = {
      prId: 'p',
      prTitle: 't',
      agentName: 'a',
      findingsCount: 0,
      verdict: 'comment' as const,
    };
    const a = buildWebhookPayload(event);
    const b = buildWebhookPayload(event);
    expect(a.id).not.toBe(b.id);
  });
});
