import { describe, it, expect } from 'vitest';
import type { EvalRun } from '@devdigest/shared';
import { buildCallout } from './callout.js';

function run(overrides: Partial<EvalRun> = {}): EvalRun {
  return {
    recall: 0.9,
    precision: 0.9,
    citation_accuracy: 0.9,
    traces_passed: 9,
    traces_total: 10,
    cases_errored: 0,
    duration_ms: 1000,
    cost_usd: 0.1,
    per_case: [],
    ...overrides,
  };
}

describe('buildCallout — D12/AC-45', () => {
  it('names the metric, direction and magnitude of the largest absolute delta', () => {
    const callout = buildCallout(
      { metrics: run({ precision: 0.7 }), agentVersion: 3 },
      { metrics: run({ precision: 0.9 }) },
    );
    expect(callout).not.toBeNull();
    expect(callout!.metric).toBe('precision');
    expect(callout!.direction).toBe('down');
    expect(callout!.magnitude).toBeCloseTo(0.2);
    expect(callout!.agent_version).toBe(3);
  });

  it('emits NO causal clause when no case transitioned pass/fail', () => {
    const perCase = [
      {
        case_id: 'c1',
        name: 'case 1',
        expectation_type: 'must_not_flag' as const,
        status: 'scored' as const,
        pass: true,
        error_reason: null,
        findings_total: 0,
        findings_matched: 0,
        grounding_kept: 0,
        grounding_total: 0,
        duration_ms: 1,
        cost_usd: null,
        actual: [],
      },
    ];
    const callout = buildCallout(
      { metrics: run({ precision: 0.7, per_case: perCase }), agentVersion: 2 },
      { metrics: run({ precision: 0.9, per_case: perCase }) },
    );
    expect(callout!.case_transitions).toEqual([]);
  });

  it('names the specific case transitions when they exist', () => {
    const previousCase = {
      case_id: 'c1',
      name: 'no secrets in config',
      expectation_type: 'must_not_flag' as const,
      status: 'scored' as const,
      pass: true,
      error_reason: null,
      findings_total: 0,
      findings_matched: 0,
      grounding_kept: 0,
      grounding_total: 0,
      duration_ms: 1,
      cost_usd: null,
      actual: [],
    };
    const latestCase = { ...previousCase, pass: false, findings_matched: 1, findings_total: 1 };

    const callout = buildCallout(
      { metrics: run({ precision: 0.7, per_case: [latestCase] }), agentVersion: 2 },
      { metrics: run({ precision: 0.9, per_case: [previousCase] }) },
    );
    expect(callout!.case_transitions).toEqual([
      { case_id: 'c1', name: 'no secrets in config', from: true, to: false },
    ]);
  });

  it('returns null when neither run has any comparable (non-null) metric', () => {
    const callout = buildCallout(
      { metrics: run({ recall: null, precision: null, citation_accuracy: null }), agentVersion: 1 },
      { metrics: run({ recall: null, precision: null, citation_accuracy: null }) },
    );
    expect(callout).toBeNull();
  });
});
