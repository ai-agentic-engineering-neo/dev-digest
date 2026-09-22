import { pgTable, uuid, text, integer, timestamp, numeric } from 'drizzle-orm/pg-core';
import { enumCheck } from './_shared';
import { agents } from './agents';

export const CI_TARGET_TYPES = ['gha', 'circle', 'jenkins', 'cli'] as const;

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    targetType: text('target_type', { enum: CI_TARGET_TYPES }).notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [enumCheck('ci_installations_target_type_chk', t.targetType, CI_TARGET_TYPES)],
);

export const ciRuns = pgTable('ci_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
    onDelete: 'set null',
  }),
  prNumber: integer('pr_number'),
  ranAt: timestamp('ran_at', { withTimezone: true }),
  status: text('status'),
  findingsCount: integer('findings_count'),
  /** USD — exact decimal (money), read back as a JS number. */
  costUsd: numeric('cost_usd', { precision: 12, scale: 6, mode: 'number' }),
  githubUrl: text('github_url'),
  source: text('source'),
});
