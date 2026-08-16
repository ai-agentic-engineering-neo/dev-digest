import { describe, it, expect } from 'vitest';
import { renderFacts, renderTour } from '../src/modules/onboarding/render.js';
import type { FactSet } from '../src/modules/onboarding/facts.js';
import type { OnboardingSection } from '@devdigest/shared';

/**
 * specs/10-onboarding-generator.md — AC-33/AC-35: `renderFacts` is the ONE
 * function called both for the skeleton and alongside a stored tour, so the
 * facts a reader sees can never diverge between the two.
 */

function fullFacts(): FactSet {
  return {
    stack: {
      language: { value: 'TypeScript', evidenceFile: 'tsconfig.json' },
      runtime: { value: 'node >=22', evidenceFile: 'package.json' },
      packageManager: { value: 'pnpm', evidenceFile: 'pnpm-lock.yaml' },
      frameworks: [{ value: 'Fastify', evidenceFile: 'package.json' }],
    },
    setupCandidates: [{ command: 'npm run dev', kind: 'script', evidenceFile: 'package.json' }],
    directory: ['src'],
    rankedFiles: [{ path: 'src/a.ts', pagerank: 1, hotness: 0.5, weighted: 1.5 }],
    routes: [{ file: 'src/routes.ts', endpoints: ['GET /health'], crons: [] }],
    readingPath: [{ path: 'src/a.ts', weighted: 1.5 }],
    criticalPaths: [],
    coverage: {
      filesIndexed: 10,
      filesExcluded: 2,
      indexStatus: 'partial',
      indexReason: 'timed out',
      indexSha: 'sha',
      indexerVersion: 2,
      prsWeighted: 4,
      hotnessWindowDays: 180,
    },
    allIndexedPaths: new Set(['src/a.ts']),
  };
}

describe('renderFacts', () => {
  it('maps every fact group with its evidence (AC-2, AC-4, AC-35)', () => {
    const facts = renderFacts(fullFacts());
    expect(facts.stack.language).toEqual({ value: 'TypeScript', evidence_file: 'tsconfig.json' });
    expect(facts.stack.frameworks).toEqual([{ value: 'Fastify', evidence_file: 'package.json' }]);
    expect(facts.ranked_files).toEqual([{ path: 'src/a.ts', pagerank: 1, hotness: 0.5, weighted: 1.5 }]);
    expect(facts.setup_steps).toEqual([{ command: 'npm run dev', kind: 'script', evidence_file: 'package.json' }]);
    expect(facts.routes).toEqual([{ file: 'src/routes.ts', endpoints: ['GET /health'], crons: [] }]);
  });

  it('reports an undetected stack value as null, not a missing key', () => {
    const facts = renderFacts({ ...fullFacts(), stack: { frameworks: [] } });
    expect(facts.stack.language).toBeNull();
    expect(facts.stack.runtime).toBeNull();
    expect(facts.stack.package_manager).toBeNull();
    expect(facts.stack.frameworks).toEqual([]);
  });
});

describe('renderTour', () => {
  it('wraps grounded sections into the shared Onboarding shape unchanged', () => {
    const sections: OnboardingSection[] = [
      { kind: 'architecture', title: 'Overview', body: 'text', links: [] },
    ];
    expect(renderTour(sections)).toEqual({ sections });
  });
});
