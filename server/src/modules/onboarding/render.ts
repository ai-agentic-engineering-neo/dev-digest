import type { Onboarding, OnboardingFacts, OnboardingSection } from '@devdigest/shared';
import type { FactSet } from './facts.js';

/**
 * Maps internal shapes → the shared wire contract. ONE renderer
 * (`renderFacts`), TWO entry points (called for the skeleton response AND
 * alongside every stored/generated tour) — so a skeleton and a tour can never
 * describe different facts, the same "a preview must not lie" discipline
 * `_shared/skill-render.ts` already applies elsewhere (AC-33/AC-35).
 */

export function renderFacts(facts: FactSet): OnboardingFacts {
  return {
    stack: {
      language: facts.stack.language
        ? { value: facts.stack.language.value, evidence_file: facts.stack.language.evidenceFile }
        : null,
      runtime: facts.stack.runtime
        ? { value: facts.stack.runtime.value, evidence_file: facts.stack.runtime.evidenceFile }
        : null,
      package_manager: facts.stack.packageManager
        ? { value: facts.stack.packageManager.value, evidence_file: facts.stack.packageManager.evidenceFile }
        : null,
      frameworks: facts.stack.frameworks.map((f) => ({ value: f.value, evidence_file: f.evidenceFile })),
    },
    ranked_files: facts.rankedFiles.map((r) => ({
      path: r.path,
      pagerank: r.pagerank,
      hotness: r.hotness,
      weighted: r.weighted,
    })),
    setup_steps: facts.setupCandidates.map((c) => ({
      command: c.command,
      kind: c.kind,
      evidence_file: c.evidenceFile,
    })),
    routes: facts.routes.map((r) => ({ file: r.file, endpoints: r.endpoints, crons: r.crons })),
  };
}

/** Wraps grounded sections into the shared `Onboarding` shape — trivial, but
 *  named so `service.ts` never hand-builds `{ sections }` itself. */
export function renderTour(sections: OnboardingSection[]): Onboarding {
  return { sections };
}
