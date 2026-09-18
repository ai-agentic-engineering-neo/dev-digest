import { describe, expect, it } from 'vitest';
import { toAgentSkillLink } from './helpers.js';

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
