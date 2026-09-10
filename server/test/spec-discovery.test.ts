import { describe, expect, it } from 'vitest';
import {
  collectSpecCandidates,
  isSpecShapedPath,
  mentionsSpecWithoutPath,
  parseSpecRef,
} from '../src/modules/_shared/linked-issue.js';

const PR24_BODY = `## Summary
Analytics dashboard for the admin panel.

Spec: docs/specs/analytics-dashboard-spec.md
Covers: AC-1.1-1.3, AC-10.1-10.5`;

const PR24_FILES = [
  'server/src/controllers/analyticsController.js',
  'docs/specs/analytics-dashboard-spec.md',
  'client/vite.config.js',
];

describe('spec discovery', () => {
  it('finds the real quick-blog spec that the old regex missed', () => {
    expect(parseSpecRef(PR24_BODY)).toBe('docs/specs/analytics-dashboard-spec.md');
  });

  it('still matches devdigest own convention', () => {
    expect(parseSpecRef('see specs/05-intent-layer.md for detail')).toBe('specs/05-intent-layer.md');
  });

  it('finds a spec present only in the diff, never referenced in the body', () => {
    expect(collectSpecCandidates('no mention here', PR24_FILES)).toEqual([
      'docs/specs/analytics-dashboard-spec.md',
    ]);
  });

  it('ranks the body-referenced spec first and reports the rest as unused', () => {
    const c = collectSpecCandidates(PR24_BODY, [...PR24_FILES, 'docs/requirements/legacy.md']);
    expect(c[0]).toBe('docs/specs/analytics-dashboard-spec.md');
    expect(c.slice(1)).toContain('docs/requirements/legacy.md');
  });

  it('refuses a traversal path injected via the PR body', () => {
    const evil = 'Spec: ../../../../etc/passwd.md';
    expect(collectSpecCandidates(evil, PR24_FILES)).not.toContain('../../../../etc/passwd.md');
  });

  it('flags a spec discussed but not identifiable', () => {
    expect(mentionsSpecWithoutPath('implements the spec agreed last week')).toBe(true);
  });

  it('stays quiet on a PR that never mentions a spec', () => {
    expect(mentionsSpecWithoutPath('fix a typo in the footer')).toBe(false);
  });

  it('classifies concrete paths', () => {
    expect(isSpecShapedPath('docs/specs/analytics-dashboard-spec.md')).toBe(true);
    expect(isSpecShapedPath('server/src/controllers/analyticsController.js')).toBe(false);
  });
});
