import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index, unique } from 'drizzle-orm/pg-core';
import { enumCheck } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

/** GitHub merge state (open/merged/closed) + the review states (seed / legacy). = PrStatus. */
export const PR_STATUSES = ['needs_review', 'reviewed', 'stale', 'open', 'closed', 'merged'] as const;

export const pullRequests = pgTable(
  'pull_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    author: text('author').notNull(),
    branch: text('branch').notNull(),
    base: text('base').notNull(),
    headSha: text('head_sha').notNull(),
    lastReviewedSha: text('last_reviewed_sha'),
    additions: integer('additions').notNull().default(0),
    deletions: integer('deletions').notNull().default(0),
    filesCount: integer('files_count').notNull().default(0),
    status: text('status', { enum: PR_STATUSES }).notNull().default('needs_review'),
    body: text('body'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => ({
    uq: uniqueIndex('pr_repo_number_uq').on(t.repoId, t.number), // idempotent import
    wsIdx: index('pr_ws_idx').on(t.workspaceId),
    statusChk: enumCheck('pull_requests_status_chk', t.status, PR_STATUSES),
  }),
);

export const prFiles = pgTable(
  'pr_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    additions: integer('additions').notNull().default(0),
    deletions: integer('deletions').notNull().default(0),
    patch: text('patch'),
  },
  // One row per file per PR (upsert target); leading pr_id also serves the FK lookups.
  (t) => [unique('pr_files_pr_path_uq').on(t.prId, t.path)],
);

export const prCommits = pgTable(
  'pr_commits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    sha: text('sha').notNull(),
    message: text('message').notNull(),
    author: text('author').notNull(),
    committedAt: timestamp('committed_at', { withTimezone: true }),
  },
  (t) => [unique('pr_commits_pr_sha_uq').on(t.prId, t.sha)],
);
