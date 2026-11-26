import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { PromptSkill } from '../ports.js';

// ---- prompt skills (agent_skills ⋈ skills, read-only) ----------------------

/** Enabled skills linked to an agent, in link order (skill id breaks ties). */
export async function loadPromptSkills(db: Db, agentId: string): Promise<PromptSkill[]> {
  return db
    .select({ name: t.skills.name, version: t.skills.version, body: t.skills.body })
    .from(t.agentSkills)
    .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
    .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
    .orderBy(asc(t.agentSkills.order), asc(t.agentSkills.skillId));
}
