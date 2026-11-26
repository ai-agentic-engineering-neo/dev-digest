import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * M2 Task 5 — `ReviewRepository.loadPromptSkills` (the PromptSkillsSource port
 * over agent_skills ⋈ skills): link order kept, globally disabled skills dropped.
 */
d('ReviewRepository.loadPromptSkills', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('returns enabled skills in agent_skills.order with name, version, body', async () => {
    const { db } = pg.handle;
    const [ws] = await db.insert(t.workspaces).values({ name: 'ws' }).returning();
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId: ws!.id, name: 'A', provider: 'openai', model: 'm', systemPrompt: 's' })
      .returning();
    const skill = async (name: string, enabled: boolean, version = 1) =>
      (
        await db
          .insert(t.skills)
          .values({
            workspaceId: ws!.id,
            name,
            description: '',
            type: 'security',
            source: 'manual',
            body: `${name} body`,
            enabled,
            version,
          })
          .returning()
      )[0]!.id;
    const first = await skill('first', true, 3);
    const off = await skill('off', false);
    const second = await skill('second', true);
    await db.insert(t.agentSkills).values([
      { agentId: agent!.id, skillId: second, order: 2 },
      { agentId: agent!.id, skillId: off, order: 1 },
      { agentId: agent!.id, skillId: first, order: 0 },
    ]);

    const repo = new ReviewRepository(db);
    expect(await repo.loadPromptSkills(agent!.id)).toEqual([
      { name: 'first', version: 3, body: 'first body' },
      { name: 'second', version: 1, body: 'second body' },
    ]);
    expect(await repo.loadPromptSkills('00000000-0000-0000-0000-000000000000')).toEqual([]);
  });
});
