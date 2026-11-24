import { z } from 'zod';
import { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';

/** `/providers/:id` addresses a provider by name, not a uuid. */
export const ProviderParams = z.object({ id: Provider });

/** `/agents/:id/versions/:version` — id is a uuid, version a positive integer. */
export const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

export const CreateAgentBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  provider: Provider,
  model: z.string().min(1),
  system_prompt: z.string().min(1),
  output_schema: z.unknown().optional(),
  strategy: ReviewStrategy.optional(),
  ci_fail_on: CiFailOn.optional(),
  repo_intel: z.boolean().optional(),
  enabled: z.boolean().optional(),
});
export type CreateAgentBody = z.infer<typeof CreateAgentBody>;

export const UpdateAgentBody = CreateAgentBody.partial().extend({
  name: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  system_prompt: z.string().min(1).optional(),
});
export type UpdateAgentBody = z.infer<typeof UpdateAgentBody>;

/** Either set the whole ordered set (`skill_ids`) or link one (`skill_id`). */
export const SetSkillsBody = z
  .object({
    skill_ids: z.array(z.string().uuid()).optional(),
    skill_id: z.string().uuid().optional(),
    order: z.number().int().optional(),
  })
  .refine((b) => b.skill_ids !== undefined || b.skill_id !== undefined, {
    message: 'Provide skill_ids (set/reorder) or skill_id (link one)',
  });
