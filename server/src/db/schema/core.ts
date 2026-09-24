import { pgTable, uuid, text, jsonb, unique, primaryKey } from 'drizzle-orm/pg-core';
import { now, enumCheck } from './_shared';

// ============================================================ Tenancy & core

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  createdAt: now(),
});

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: now(),
});

export const WORKSPACE_ROLES = ['owner', 'member'] as const;

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: WORKSPACE_ROLES }).notNull().default('member'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.userId] }),
    roleChk: enumCheck('workspace_members_role_chk', t.role, WORKSPACE_ROLES),
  }),
);

/** Non-secret prefs/config. Secrets go via SecretsProvider, NOT here. */
export const settings = pgTable(
  'settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value'),
  },
  (t) => ({
    // NULLS NOT DISTINCT: workspace-level rows (user_id NULL) stay one-per-key,
    // so ON CONFLICT (workspace_id, user_id, key) upserts them too.
    uq: unique('settings_ws_user_key_uq').on(t.workspaceId, t.userId, t.key).nullsNotDistinct(),
  }),
);
