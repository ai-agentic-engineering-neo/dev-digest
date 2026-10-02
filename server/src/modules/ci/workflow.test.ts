import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { buildWorkflowYaml } from './workflow.js';
import { PINNED_ACTIONS } from './constants.js';

/**
 * specs/14-export-to-ci.md (P2, P-9) — `buildWorkflowYaml` builds a plain
 * object tree and hands it to `yaml`'s `Document`/`stringify`, never
 * hand-rolled string concatenation (plans/14 Phase B4). These tests prove
 * the two properties that construction method exists to guarantee: (1) the
 * output round-trips to a well-formed document with the expected shape, and
 * (2) a value from a caller-controlled field can never break out of its
 * surrounding YAML structure — the exact failure mode string concatenation
 * would have been vulnerable to.
 */
describe('buildWorkflowYaml', () => {
  it('round-trips to the expected structure for a review-posting export', () => {
    const yaml = buildWorkflowYaml({ triggers: ['opened', 'synchronize'], postAs: 'github_review' });
    const parsed = parseYaml(yaml);

    expect(parsed.on.pull_request.types).toEqual(['opened', 'synchronize']);
    expect(parsed.jobs.review['runs-on']).toBe('ubuntu-latest');
    expect(parsed.jobs.review.if).toBe('github.event.pull_request.head.repo.fork == false');
    // AC-61 — write access granted only because postAs posts to the PR.
    expect(parsed.jobs.review.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });

    const steps = parsed.jobs.review.steps as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(5);
    const [checkoutStep, setupNodeStep, runStep, metadataStep, uploadStep] = steps;
    // AC-62 — every `uses:` resolves to a full commit SHA, never a tag/branch.
    expect(checkoutStep?.uses).toBe(`actions/checkout@${PINNED_ACTIONS.checkout.sha}`);
    expect(setupNodeStep?.uses).toBe(`actions/setup-node@${PINNED_ACTIONS.setupNode.sha}`);
    expect(uploadStep?.uses).toBe(`actions/upload-artifact@${PINNED_ACTIONS.uploadArtifact.sha}`);
    // D-P2/AC-16 — fixed run commands, never agent/user text.
    expect(runStep?.run).toBe('node .devdigest/runner/index.js');
    expect(metadataStep?.if).toBe('always()');
    expect(uploadStep?.if).toBe('always()');
  });

  it('grants no pull-requests write permission when postAs is none', () => {
    const yaml = buildWorkflowYaml({ triggers: ['opened'], postAs: 'none' });
    const parsed = parseYaml(yaml);
    expect(parsed.jobs.review.permissions).toEqual({ contents: 'read' });
  });

  it('never emits a pull_request_target trigger', () => {
    const yaml = buildWorkflowYaml({ triggers: ['opened', 'synchronize', 'reopened'], postAs: 'pr_comment' });
    expect(yaml).not.toContain('pull_request_target');
    const parsed = parseYaml(yaml);
    expect(Object.keys(parsed.on)).toEqual(['pull_request']);
  });

  it('rejects a postAs value outside the closed set even though the type forbids it', () => {
    expect(() =>
      buildWorkflowYaml({ triggers: ['opened'], postAs: 'anything' as never }),
    ).toThrow(/Invalid post_as value/);
  });

  it('P-9 — a hostile/unrecognised trigger value cannot break out of the YAML structure or smuggle a new key in', () => {
    const hostileTriggers = [
      'opened',
      '"; evil_key: true\n',
      'synchronize\nnew_key: injected',
      'not-a-real-trigger',
    ];
    const yaml = buildWorkflowYaml({ triggers: hostileTriggers, postAs: 'github_review' });
    const parsed = parseYaml(yaml);

    // Only the closed-set, recognised triggers survive; the hostile/unknown
    // strings — including one that carries "synchronize" but is not an
    // *exact* match for a real trigger literal — are filtered out entirely,
    // never rendered into the document.
    expect(parsed.on.pull_request.types).toEqual(['opened']);
    // No stray top-level key could have been smuggled in via the trigger list.
    expect(Object.keys(parsed)).toEqual(['name', 'on', 'jobs']);
    expect(parsed.jobs.review).not.toHaveProperty('evil_key');
    expect(parsed.jobs.review).not.toHaveProperty('new_key');
  });

  it('re-parses to a single document (no multi-document or structural corruption)', () => {
    const yaml = buildWorkflowYaml({ triggers: ['opened'], postAs: 'github_review' });
    // A structurally-corrupted document (e.g. an unescaped value that closed
    // a mapping early) would either throw here or produce a shape that
    // doesn't match `parsed.jobs.review.steps` — either way this assertion
    // would fail before the ones above ever ran.
    expect(() => parseYaml(yaml)).not.toThrow();
  });
});
