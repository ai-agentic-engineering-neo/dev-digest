import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import {
  createdMessage,
  editMessage,
  initialEnabled,
  isValidSkillName,
  renderSkillBlock,
  restoredMessage,
  slugifySkillName,
} from '../src/modules/skills/domain/skill.js';
import { acceptRate, pullRate, windowStart } from '../src/modules/skills/domain/stats.js';
import { filterCatalog } from '../src/modules/skills/domain/catalog.js';
import { skillIdsByName, skillsLogLine, skillsUsed } from '../src/modules/reviews/domain/skills.js';
import { firstPromptSkill } from '../src/adapters/llm/mock.js';
import { builtInCommunityCatalog } from '../src/modules/skills/infrastructure/community-catalog.js';
import { SEED_AGENT_SKILLS, SEED_SKILLS } from '../src/db/seed-skills.js';
import { CreateSkillInput } from '@devdigest/shared';

/** Pure skills rules (server/specs/03-skills.md Rules §1, §3, §5, §6, Q3). */
describe('skill names', () => {
  it.each([
    ['My Skill.md', 'my-skill'],
    ['flaky_test_hunter', 'flaky-test-hunter'],
    ['  --Crème Brûlée--  ', 'creme-brulee'],
    ['OWASP Top 10 (2021).zip', 'owasp-top-10-2021'],
    ['!!!', 'imported-skill'],
  ])('slugify(%j) = %j', (raw, slug) => {
    expect(slugifySkillName(raw)).toBe(slug);
    expect(isValidSkillName(slugifySkillName(raw))).toBe(true);
  });

  it('caps a slug at 64 chars without a trailing dash', () => {
    const slug = slugifySkillName(`${'a'.repeat(63)} b`);
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('rejects names that are not kebab slugs', () => {
    expect(isValidSkillName('Has Space')).toBe(false);
    expect(isValidSkillName('double--dash')).toBe(false);
    expect(isValidSkillName('')).toBe(false);
  });
});

describe('versioning messages', () => {
  const current = { body: 'B', description: 'D' };

  it('only a changed body or description versions', () => {
    expect(editMessage(current, {})).toBeNull();
    expect(editMessage(current, { body: 'B', description: 'D' })).toBeNull();
    expect(editMessage(current, { body: 'B2' })).toBe('Edited body');
    expect(editMessage(current, { description: 'D2' })).toBe('Edited description');
    expect(editMessage(current, { body: 'B2', description: 'D2' })).toBe('Edited body and description');
  });

  it('created / imported / restored', () => {
    expect(createdMessage('manual', null)).toBe('Created');
    expect(createdMessage('manual', 'ignored.md')).toBe('Created');
    expect(createdMessage('imported_url', 'https://x.test/a.md')).toBe('Imported from https://x.test/a.md');
    expect(createdMessage('community', 'community:sql-injection-gate')).toBe(
      'Imported from community:sql-injection-gate',
    );
    expect(restoredMessage(3)).toBe('Restored from v3');
  });
});

describe('trust gate', () => {
  it('a manual skill keeps the requested state (default enabled)', () => {
    expect(initialEnabled('manual', undefined)).toBe(true);
    expect(initialEnabled('manual', false)).toBe(false);
  });

  it.each(['imported_file', 'imported_url', 'community'] as const)('%s is always stored disabled', (source) => {
    expect(initialEnabled(source, true)).toBe(false);
    expect(initialEnabled(source, undefined)).toBe(false);
  });
});

describe('prompt block (Rules §5)', () => {
  it('renders heading, applies-when line, blank line, body', () => {
    expect(renderSkillBlock({ name: 'no-then-chains', description: 'Flag .then chains.', body: 'Use await.\n' })).toBe(
      '### no-then-chains\n_Applies when:_ Flag .then chains.\n\nUse await.',
    );
  });

  it('omits the applies-when line for an empty description', () => {
    expect(renderSkillBlock({ name: 'x', description: '  ', body: 'Body' })).toBe('### x\n\nBody');
  });

  it('the engine joins the blocks under "## Skills / rules" in the given order', () => {
    const blocks = [
      renderSkillBlock({ name: 'c', description: '', body: 'C' }),
      renderSkillBlock({ name: 'a', description: '', body: 'A' }),
    ];
    const { assembly } = assemblePrompt({ system: 's', diff: 'd', skills: blocks });
    expect(assembly.user).toContain('## Skills / rules\n### c\n\nC\n\n### a\n\nA');
  });
});

describe('run skills helpers (reviews domain)', () => {
  const skills = [
    { id: 'id-c', name: 'c', description: '', body: 'C', version: 5 },
    { id: 'id-a', name: 'a', description: '', body: 'A', version: 1 },
  ];

  it('Live Log line lists name + version and the token estimate', () => {
    expect(skillsLogLine(skills, 42, false)).toBe('skills: 2 attached (c v5, a v1) · ~42 tokens');
    expect(skillsLogLine(skills, 42, true)).toBe(
      'skills: 2 attached (c v5, a v1) · ~42 tokens (repeated in every map-reduce chunk)',
    );
  });

  it('trace skills_used keeps prompt order; name → id map resolves citations', () => {
    expect(skillsUsed(skills)).toEqual([
      { id: 'id-c', name: 'c', version: 5 },
      { id: 'id-a', name: 'a', version: 1 },
    ]);
    expect(skillIdsByName(skills).get('a')).toBe('id-a');
  });
});

describe('stats math', () => {
  it('rates are null without a denominator', () => {
    expect(pullRate(0, 0)).toBeNull();
    expect(acceptRate(0, 0)).toBeNull();
    expect(pullRate(1, 4)).toBe(0.25);
    expect(acceptRate(3, 1)).toBe(0.75);
  });

  it('window start is `days` before now', () => {
    expect(windowStart(new Date('2026-09-30T00:00:00Z'), 30).toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });
});

describe('community catalog', () => {
  const all = builtInCommunityCatalog.list();

  it('ships vetted entries whose texts pass the create contract', () => {
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const e of all) {
      expect(CreateSkillInput.safeParse({ name: e.name, description: e.description, type: e.type, body: e.body }).success).toBe(true);
    }
  });

  it('filters by query, tag and language (case-insensitive)', () => {
    expect(filterCatalog(all, { q: 'OWASP' }).map((e) => e.id)).toContain('owasp-top-10-review');
    const testing = filterCatalog(all, { tag: 'Testing' });
    expect(testing.length).toBeGreaterThanOrEqual(2);
    expect(testing.every((e) => e.tags.includes('testing'))).toBe(true);
    expect(filterCatalog(all, { lang: 'sql' }).map((e) => e.id)).toEqual(['sql-injection-gate']);
    expect(filterCatalog(all, { q: 'no-such-thing' })).toEqual([]);
  });
});

describe('seeded skills', () => {
  it('are valid skills and every seeded link points at one of them', () => {
    const names = new Set(SEED_SKILLS.map((s) => s.name));
    expect(names.size).toBe(9);
    for (const s of SEED_SKILLS) {
      expect(CreateSkillInput.safeParse({ ...s }).success).toBe(true);
      expect(s.description.startsWith('Flag')).toBe(true);
    }
    for (const linked of Object.values(SEED_AGENT_SKILLS)) for (const n of linked) expect(names.has(n)).toBe(true);
    expect(SEED_SKILLS.find((s) => s.name === 'phantom-api-gate')!.enabled).toBe(false);
  });
});

describe('mock LLM skill citation', () => {
  it('finds the first ### heading under "## Skills / rules" only', () => {
    const withSkills = assemblePrompt({
      system: 's',
      diff: 'd',
      skills: ['### first\n\nA', '### second\n\nB'],
      callers: '### src/x.ts\n- `f` — sig',
    });
    expect(firstPromptSkill(withSkills.messages)).toBe('first');
    const without = assemblePrompt({ system: 's', diff: 'd', callers: '### src/x.ts\n- `f` — sig' });
    expect(firstPromptSkill(without.messages)).toBeNull();
  });
});
