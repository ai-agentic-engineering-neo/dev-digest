import { and, asc, eq } from 'drizzle-orm';
import { effectiveSkillSafety, isSkillFlagged } from '@devdigest/reviewer-core';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { PromptSkill } from '../ports.js';

// ---- prompt skills (agent_skills ⋈ skills, read-only) ----------------------

/**
 * Enabled skills linked to an agent, in link order (skill id breaks ties).
 * A skill whose body fails the injection scan is dropped (defense in depth: a
 * flagged write already switches the skill off; this covers legacy rows).
 */
export async function loadPromptSkills(db: Db, agentId: string): Promise<PromptSkill[]> {
  const rows = await db
    .select({
      name: t.skills.name,
      version: t.skills.version,
      body: t.skills.body,
      safety: t.skills.safety,
      updatedAt: t.skills.updatedAt,
    })
    .from(t.agentSkills)
    .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
    .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
    .orderBy(asc(t.agentSkills.order), asc(t.agentSkills.skillId));
  return rows
    .filter((r) => !isSkillFlagged(effectiveSkillSafety(r.safety, r.body, r.updatedAt.toISOString())))
    .map(({ name, version, body }) => ({ name, version, body }));
}
