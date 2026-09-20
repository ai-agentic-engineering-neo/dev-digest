import { describe, it, expect } from 'vitest';
import { computeSkillStats, findingDecision, skillWasPulled } from '../src/modules/skills/helpers.js';
import type { SkillFindingUsage, SkillLinkUsage, SkillRunUsage } from '../src/modules/skills/repository.js';

const link = (skillId: string, agentId: string, agentName: string, enabled = true): SkillLinkUsage => ({
  skillId, skillName: 'x', agentId, agentName, linkEnabled: enabled,
});
const run = (runId: string, agentId: string, skillsText: string | null): SkillRunUsage => ({ runId, agentId, skillsText });
const fnd = (
  runId: string,
  category: string,
  acceptedAt: Date | null = null,
  dismissedAt: Date | null = null,
): SkillFindingUsage => ({ runId, category, acceptedAt, dismissedAt });
const D = (n: number) => new Date(2026, 0, n);

const stats = (
  skills: Array<{ id: string; name: string }>,
  links: SkillLinkUsage[],
  runs: SkillRunUsage[],
  findings: SkillFindingUsage[],
) => computeSkillStats({ skills, links, runs, findings, windowDays: 30 });

describe('skillWasPulled', () => {
  it('matches the header at a line start only', () => {
    expect(skillWasPulled('### api\nbody', 'api')).toBe(true);
    expect(skillWasPulled('intro\n\n### api\r\nbody', 'api')).toBe(true);
    expect(skillWasPulled('text ### api\nbody', 'api')).toBe(false); // mid-line
    expect(skillWasPulled(null, 'api')).toBe(false);
    expect(skillWasPulled('', 'api')).toBe(false);
  });
  it('does not confuse a name with a longer one that starts with it', () => {
    expect(skillWasPulled('### api-gate\nbody', 'api')).toBe(false);
    expect(skillWasPulled('### api-gate\nx\n\n### api\ny', 'api')).toBe(true);
  });
  it('is safe for names with regex characters', () => {
    expect(skillWasPulled('### c++ (v1.0) [a|b]*\nbody', 'c++ (v1.0) [a|b]*')).toBe(true);
    expect(skillWasPulled('### cxx\nbody', 'c.+')).toBe(false);
    expect(skillWasPulled('### anything\nbody', '.*')).toBe(false);
  });
});

describe('findingDecision', () => {
  it('handles undecided, accepted, dismissed and both set (latest wins)', () => {
    expect(findingDecision({ acceptedAt: null, dismissedAt: null })).toBeNull();
    expect(findingDecision({ acceptedAt: D(1), dismissedAt: null })).toBe('accepted');
    expect(findingDecision({ acceptedAt: null, dismissedAt: D(1) })).toBe('dismissed');
    expect(findingDecision({ acceptedAt: D(2), dismissedAt: D(1) })).toBe('accepted');
    expect(findingDecision({ acceptedAt: D(1), dismissedAt: D(2) })).toBe('dismissed');
    expect(findingDecision({ acceptedAt: D(1), dismissedAt: D(1) })).toBe('accepted');
  });
});

describe('computeSkillStats', () => {
  it('gives a skill with no links zeros, nulls and empty arrays', () => {
    const [s] = stats([{ id: 's1', name: 'api' }], [], [run('r1', 'a1', '### api')], []);
    expect(s).toEqual({
      skill_id: 's1', agents_count: 0, pull_rate: null, accept_rate: null, window_days: 30,
      runs_total: 0, runs_pulled: 0, findings_total: 0, findings_accepted: 0, findings_dismissed: 0,
      agents: [], by_category: [],
    });
  });

  it('links without runs: agents counted (enabled or not), rates null', () => {
    const [s] = stats([{ id: 's1', name: 'api' }], [link('s1', 'a1', 'B'), link('s1', 'a2', 'A', false)], [], []);
    expect(s).toMatchObject({ agents_count: 2, pull_rate: null, accept_rate: null, runs_total: 0 });
    expect(s!.agents).toEqual([
      { id: 'a2', name: 'A', enabled: false },
      { id: 'a1', name: 'B', enabled: true },
    ]);
  });

  it('counts only runs of linked agents; pull rate and per-skill pulls differ', () => {
    const skills = [{ id: 's1', name: 'api' }, { id: 's2', name: 'api-gate' }];
    const links = [link('s1', 'a1', 'A'), link('s2', 'a1', 'A')];
    const runs = [
      run('r1', 'a1', '### api\nx\n\n### api-gate\ny'),
      run('r2', 'a1', '### api-gate\ny'),
      run('r3', 'a1', null),
      run('r4', 'a1', 'note ### api'),
      run('other', 'a9', '### api'), // agent without a link
    ];
    const [api, gate] = stats(skills, links, runs, []);
    expect(api).toMatchObject({ runs_total: 4, runs_pulled: 1, pull_rate: 0.25 });
    expect(gate).toMatchObject({ runs_total: 4, runs_pulled: 2, pull_rate: 0.5 });
  });

  it('findings come only from pulled runs; accept/dismiss rules; categories sorted', () => {
    const runs = [run('r1', 'a1', '### api'), run('r2', 'a1', null)];
    const findings = [
      fnd('r1', 'style', D(1)),
      fnd('r1', 'bug', null, D(1)),
      fnd('r1', 'bug', D(1), D(2)), // both set, dismissed later
      fnd('r1', 'perf'), // undecided
      fnd('r1', 'style'),
      fnd('r1', 'style'),
      fnd('r2', 'security', D(1)), // run did not pull the skill
    ];
    const [s] = stats([{ id: 's1', name: 'api' }], [link('s1', 'a1', 'A')], runs, findings);
    expect(s).toMatchObject({
      runs_total: 2, runs_pulled: 1, pull_rate: 0.5,
      findings_total: 6, findings_accepted: 1, findings_dismissed: 2, accept_rate: 1 / 3,
    });
    // count desc, then name asc (bug=2, style=3 -> style, bug, perf)
    expect(s!.by_category).toEqual([
      { category: 'style', count: 3 },
      { category: 'bug', count: 2 },
      { category: 'perf', count: 1 },
    ]);
  });

  it('accept_rate is null while nothing is decided', () => {
    const [s] = stats([{ id: 's1', name: 'api' }], [link('s1', 'a1', 'A')], [run('r1', 'a1', '### api')], [fnd('r1', 'bug')]);
    expect(s).toMatchObject({ findings_total: 1, accept_rate: null });
  });

  it('breaks category ties by name', () => {
    const [s] = stats(
      [{ id: 's1', name: 'api' }], [link('s1', 'a1', 'A')], [run('r1', 'a1', '### api')],
      [fnd('r1', 'test'), fnd('r1', 'bug')],
    );
    expect(s!.by_category.map((c) => c.category)).toEqual(['bug', 'test']);
  });
});
