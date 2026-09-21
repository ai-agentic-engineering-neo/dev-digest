import { describe, it, expect } from 'vitest';
import { listRegisteredTargets, listTargetOptions, getTargetGenerator } from './targets.js';
import { WORKFLOW_PATH } from './constants.js';

/**
 * specs/14-export-to-ci.md (P2, D13/AC-2/AC-2a) — the target registry. A
 * target with no entry here is not rendered anywhere by the wizard, not
 * disabled/"coming soon" (N1). The client's `TargetStep.tsx` renders exactly
 * one option per `listTargetOptions()` entry — these tests confirm that
 * registry's real shape, since the client trusts it verbatim.
 */

describe('listRegisteredTargets', () => {
  it('AC-2 — returns only targets with a real generator, never an unimplemented CiTarget enum member', () => {
    const targets = listRegisteredTargets();
    expect(targets).toContain('gha');
    // `circle`/`jenkins`/`cli` are valid `CiTarget` enum members with no
    // generator registered (D13) — they must not appear here.
    expect(targets).not.toContain('circle');
    expect(targets).not.toContain('jenkins');
    expect(targets).not.toContain('cli');
  });
});

describe('listTargetOptions', () => {
  it("AC-2a — the client's exact consumed shape: {target, label_key} per registered target only", () => {
    const options = listTargetOptions();
    expect(options).toEqual([{ target: 'gha', label_key: 'exportWizard.targets.gha' }]);
  });

  it('every option label_key is namespaced under exportWizard.targets, matching TargetStep.tsx\'s lookup', () => {
    for (const opt of listTargetOptions()) {
      expect(opt.label_key).toBe(`exportWizard.targets.${opt.target}`);
    }
  });
});

describe('getTargetGenerator', () => {
  it('returns a real generator for a registered target, with the expected workflow path', () => {
    const generator = getTargetGenerator('gha');
    expect(generator).toBeDefined();
    expect(generator!.target).toBe('gha');
    expect(generator!.workflowPath).toBe(WORKFLOW_PATH);
    expect(typeof generator!.buildWorkflow).toBe('function');
  });

  it('returns undefined for an unregistered target, never a stub/placeholder generator', () => {
    expect(getTargetGenerator('circle')).toBeUndefined();
    expect(getTargetGenerator('jenkins')).toBeUndefined();
    expect(getTargetGenerator('cli')).toBeUndefined();
  });
});
