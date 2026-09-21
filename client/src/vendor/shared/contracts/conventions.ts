import { z } from 'zod';
import { Skill, SkillType } from './knowledge.js';

/**
 * Conventions extractor contracts (Skills Lab -> Conventions).
 *
 * Kept in their own file (not `knowledge.ts`) so the scan/triage/skill flow can
 * evolve independently of the Skills contracts it merely consumes.
 */

export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'errors',
  'testing',
  'imports',
  'typing',
  'api',
  'general',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

/**
 * Triage state of a candidate. Three states, not a boolean: a re-scan replaces
 * only `pending` rows, so `rejected` is what keeps a rule the user dismissed
 * from reappearing on every scan.
 */
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/**
 * One extracted house-rule proposal. `evidence_path` / `evidence_line` /
 * `evidence_snippet` are VERIFIED server-side against the checked-out file
 * before the row is written: a candidate whose snippet is not in the file is
 * dropped, never persisted, so everything the UI shows is real code.
 *
 * `occurrences` is code-verified support (how many sampled files contain the
 * snippet), not the model's self-reported count; `evidence_files` lists those
 * files (the primary `evidence_path` first).
 */
export const ConventionCandidate = z.object({
  id: z.string(),
  repo_id: z.string().nullish(),
  category: ConventionCategory,
  rule: z.string(),
  rationale: z.string().nullish(),
  evidence_path: z.string(),
  evidence_line: z.number().int().nullish(),
  evidence_snippet: z.string(),
  evidence_files: z.array(z.string()),
  occurrences: z.number().int(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  created_at: z.string().nullish(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/**
 * Result of `POST /repos/:id/conventions/extract`. The counters explain the gap
 * between what the model proposed and what survived: `dropped_ungrounded` is
 * the code-side evidence gate doing its job, `dropped_duplicate` counts rules
 * merged into a cluster or suppressed because the user already decided them.
 */
export const ConventionExtractResult = z.object({
  candidates: z.array(ConventionCandidate),
  sampled_files: z.array(z.string()),
  proposed: z.number().int(),
  dropped_ungrounded: z.number().int(),
  dropped_duplicate: z.number().int(),
  model: z.string(),
  cost_usd: z.number().nullish(),
});
export type ConventionExtractResult = z.infer<typeof ConventionExtractResult>;

/**
 * The skill draft assembled from ACCEPTED candidates
 * (`GET /repos/:id/conventions/skill-draft`). Persists nothing: the user edits it
 * in the Create-skill modal, then `POST /repos/:id/conventions/skill` saves it.
 */
export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  evidence_files: z.array(z.string()),
  convention_ids: z.array(z.string()),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

/** `POST /repos/:id/conventions/skill` — persist the (user-edited) draft. */
export const ConventionSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  type: SkillType.default('convention'),
  body: z.string().min(1),
  /** Agent to link the skill to, additively. Omitted = create the skill only. */
  agent_id: z.string().uuid().nullish(),
});
export type ConventionSkillBody = z.infer<typeof ConventionSkillBody>;

export const ConventionSkillResult = z.object({
  skill: Skill,
  /** true = a new skill was created; false = the existing one was updated (new version). */
  created: z.boolean(),
  agent_id: z.string().nullable(),
  /** false when no agent was chosen, or the skill is injection-blocked and cannot be linked. */
  linked: z.boolean(),
});
export type ConventionSkillResult = z.infer<typeof ConventionSkillResult>;

/** `PATCH /conventions/:id` — accept / reject / edit. */
export const UpdateConventionBody = z.object({
  status: ConventionStatus.optional(),
  rule: z.string().min(1).optional(),
  rationale: z.string().nullable().optional(),
  category: ConventionCategory.optional(),
});
export type UpdateConventionBody = z.infer<typeof UpdateConventionBody>;
