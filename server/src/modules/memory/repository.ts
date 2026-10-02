import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * specs/14-export-to-ci.md (D-P4) — the sibling `feat/multi-agent-review`
 * worktree (specs/13-multi-agent-review.md §B2) owns `MemoryRepository`'s
 * WRITE path (`findByFindingId`, `insertLearning`, backing a
 * `POST /findings/:id/learn` action) and had not merged to `main` at the time
 * this file was created here. This feature needs only a READ across a
 * repository's memory rows (D16/AC-58's export), so it adds exactly that one
 * method — same file path, same class name — so a later merge of the sibling
 * branch is a method-level union inside one class, not two competing
 * `modules/memory/` modules.
 *
 * This module registers NO route in `modules/index.ts` — it exposes no HTTP
 * surface of its own (the one deliberate exception to "every module
 * self-registers", server/CLAUDE.md, called out explicitly here per D-P4).
 * Consumers reach it only through `container.memoryRepo`, never a direct
 * cross-module import (`no-cross-module` — see `modules/ci/ports.ts`).
 */

export interface RepoScopedMemoryRow {
  kind: string;
  content: string;
}

export class MemoryRepository {
  constructor(private db: Db) {}

  /**
   * D16/N15 — repo-scoped rows only (`scope = 'repo'`), for the caller's
   * workspace and one imported repository. Deliberately selects only
   * `kind`/`content` at the query level: this feature's export
   * (`modules/ci/memory-export.ts`) must never see `embedding`, `sources` or
   * `confidence`, so there is nothing to accidentally leak downstream.
   */
  async listRepoScoped(workspaceId: string, repoId: string): Promise<RepoScopedMemoryRow[]> {
    return this.db
      .select({ kind: t.memory.kind, content: t.memory.content })
      .from(t.memory)
      .where(
        and(
          eq(t.memory.workspaceId, workspaceId),
          eq(t.memory.repoId, repoId),
          eq(t.memory.scope, 'repo'),
        ),
      );
  }
}
