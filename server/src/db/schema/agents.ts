import { pgTable, uuid, text, integer, boolean, jsonb, primaryKey, index } from 'drizzle-orm/pg-core';
import { now, enumCheck } from './_shared';
import { workspaces, users } from './core';
import { skills } from './skills';

// ============================================================ Agents & skills

export const AGENT_PROVIDERS = ['openai', 'anthropic', 'openrouter'] as const;
export const AGENT_STRATEGIES = ['single-pass', 'map-reduce', 'auto'] as const;
export const AGENT_CI_FAIL_ON = ['never', 'critical', 'warning', 'any'] as const;

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    provider: text('provider', { enum: AGENT_PROVIDERS }).notNull(),
    model: text('model').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    outputSchema: jsonb('output_schema'),
    // Review execution strategy — whole diff in one call (default) vs per-file.
    strategy: text('strategy', { enum: AGENT_STRATEGIES })
      .notNull()
      .default('single-pass'),
    // CI gate policy — when a CI review should BLOCK (REQUEST_CHANGES + fail the
    // check) vs just comment. Deterministic from finding severities.
    ciFailOn: text('ci_fail_on', { enum: AGENT_CI_FAIL_ON })
      .notNull()
      .default('critical'),
    // Whether this agent's reviews get repo-intel context (repo skeleton + callers
    // + file-rank note) injected into the prompt. Default on; the global
    // REPO_INTEL_ENABLED flag is the second gate (facade degrades when off).
    repoIntel: boolean('repo_intel').notNull().default(true),
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: now(),
  },
  (t) => [
    index('agents_ws_idx').on(t.workspaceId),
    enumCheck('agents_provider_chk', t.provider, AGENT_PROVIDERS),
    enumCheck('agents_strategy_chk', t.strategy, AGENT_STRATEGIES),
    enumCheck('agents_ci_fail_on_chk', t.ciFailOn, AGENT_CI_FAIL_ON),
  ],
);

export const agentVersions = pgTable(
  'agent_versions',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    configJson: jsonb('config_json').notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.agentId, t.version] }) }),
);

export const agentSkills = pgTable(
  'agent_skills',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    order: integer('order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.skillId] }),
    // PK leads with agent_id; "which agents use skill X" + the skills FK need this.
    skillIdx: index('agent_skills_skill_idx').on(t.skillId),
  }),
);
