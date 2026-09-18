import { describe, expect, it } from 'vitest';
import { enabledSkillBodies, toAgentSkillLink } from './helpers.js';

const row = {
  skill: {
    id: 's1',
    name: 'uncovered-branches',
    type: 'custom',
    description: 'Flag new production paths with no asserting test.',
    enabled: true,
    body: '# secret body',
  },
  order: 2,
  enabled: false,
};

describe('toAgentSkillLink', () => {
  it('maps link enabled vs skill_enabled and omits body', () => {
    const dto = toAgentSkillLink('ag1', row);
    expect(dto).toEqual({
      agent_id: 'ag1',
      skill_id: 's1',
      order: 2,
      enabled: false,
      name: 'uncovered-branches',
      type: 'custom',
      description: 'Flag new production paths with no asserting test.',
      skill_enabled: true,
    });
    expect(dto).not.toHaveProperty('body');
  });
});

function link(
  order: number,
  enabled: boolean,
  skillEnabled: boolean,
  body: string,
): { order: number; enabled: boolean; skill: { enabled: boolean; body: string } } {
  return { order, enabled, skill: { enabled: skillEnabled, body } };
}

describe('enabledSkillBodies', () => {
  it('returns dual-enabled bodies in order and skips global or per-agent off', () => {
    const bodies = enabledSkillBodies([
      link(2, true, true, 'body-b'),
      link(0, true, true, 'body-a'),
      link(1, false, true, 'per-agent-off'),
      link(3, true, false, 'global-off'),
    ]);
    expect(bodies).toEqual(['body-a', 'body-b']);
  });

  it('returns [] when every row is disabled or the list is empty', () => {
    expect(enabledSkillBodies([])).toEqual([]);
    expect(enabledSkillBodies([link(0, false, true, 'x'), link(1, true, false, 'y')])).toEqual([]);
  });

  it('maps to bodies, never descriptions', () => {
    expect(enabledSkillBodies([link(0, true, true, '# only the body')])).toEqual(['# only the body']);
  });
});
