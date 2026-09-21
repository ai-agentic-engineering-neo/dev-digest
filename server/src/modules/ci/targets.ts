import type { CiTarget, CiTargetOption } from '@devdigest/shared';
import { WORKFLOW_PATH } from './constants.js';
import { buildWorkflowYaml, type BuildWorkflowInput } from './workflow.js';

/**
 * specs/14-export-to-ci.md (P2, D13/AC-2/AC-2a) — the target registry: a map
 * from `CiTarget` to a real generator. A target with no entry here is not
 * rendered anywhere by the wizard — not disabled, not "coming soon" (N1).
 * Registering a second target (e.g. CircleCI) later is exactly one entry in
 * this map; no client Target-step edit is required.
 */

export interface CiTargetGenerator {
  target: CiTarget;
  /** Where the generated workflow file lands in the target repo. */
  workflowPath: string;
  buildWorkflow(input: BuildWorkflowInput): string;
}

const GHA_GENERATOR: CiTargetGenerator = {
  target: 'gha',
  workflowPath: WORKFLOW_PATH,
  buildWorkflow: buildWorkflowYaml,
};

// D13 — deliberately minimal: a list of implemented targets, not a plugin
// system (N1). CircleCI/Jenkins/CLI are valid `CiTarget` enum members but
// have no entry here, so they render nowhere in this slice.
const CI_TARGET_REGISTRY: Partial<Record<CiTarget, CiTargetGenerator>> = {
  gha: GHA_GENERATOR,
};

export function listRegisteredTargets(): CiTarget[] {
  return Object.keys(CI_TARGET_REGISTRY) as CiTarget[];
}

/** `GET /ci/targets`'s real response shape (`CiTargetOption`, AC-2/AC-2a) —
 *  the registry's own projection. `label_key` is relative to the client's
 *  `"ci"` i18n namespace (`exportWizard.targets.<target>`); the Target step
 *  reads `${label_key}Desc` for the description line. Registering a second
 *  target here is the ENTIRE change needed for a second option to appear —
 *  no client edit. */
export function listTargetOptions(): CiTargetOption[] {
  return listRegisteredTargets().map((target) => ({
    target,
    label_key: `exportWizard.targets.${target}`,
  }));
}

export function getTargetGenerator(target: CiTarget): CiTargetGenerator | undefined {
  return CI_TARGET_REGISTRY[target];
}
