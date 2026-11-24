import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SEED_SKILLS } from '../src/db/seed-skills.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** Seeded skills: created once, linked to the right agents in order, idempotent. */
d('seed — skills', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    await seed(pg.handle.db); // second run must not duplicate anything
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('creates each seed skill exactly once', async () => {
    const rows = await pg.handle.db.select().from(t.skills);
    expect(rows).toHaveLength(SEED_SKILLS.length);
    expect(new Set(rows.map((r) => r.name)).size).toBe(SEED_SKILLS.length);
  });

  it('links the three test skills to Test Quality Reviewer in seed order', async () => {
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.name, 'Test Quality Reviewer'));
    expect(agent).toBeDefined();
    const links = await pg.handle.db
      .select({ name: t.skills.name, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(eq(t.agentSkills.agentId, agent!.id));
    expect(links.sort((a, b) => a.order - b.order).map((l) => l.name)).toEqual([
      'untested-branches',
      'missing-corner-cases',
      'over-mocking',
    ]);
  });

  it('does not seed the import-demo skill', async () => {
    const rows = await pg.handle.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.name, 'flaky-test-patterns'));
    expect(rows).toHaveLength(0);
  });
});
