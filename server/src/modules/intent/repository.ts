import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * DB access for the intent module — the only file here allowed to touch
 * `db/` directly (onion-architecture's db-only-in-repositories rule). Owns:
 *   - the one READ this module needs beyond what's passed in (commit
 *     messages, the indirect-fallback signal), and
 *   - the cache WRITE onto `pull_requests` (overwritten every run, no
 *     history — see specs/05-intent-layer.md's Schema changes section).
 */

export interface SaveIntentInput {
  summary: string;
  inScope: string[];
  outOfScope: string[];
  contextGaps: string[];
  signals: string[];
}

export class IntentRepository {
  constructor(private db: Db) {}

  async getCommitMessages(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId));
    return rows.map((r) => r.message);
  }

  async saveIntent(prId: string, input: SaveIntentInput): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        intentSummary: input.summary,
        intentInScope: input.inScope,
        intentOutOfScope: input.outOfScope,
        intentContextGaps: input.contextGaps,
        intentSignals: input.signals,
        intentResolvedAt: new Date(),
      })
      .where(eq(t.pullRequests.id, prId));
  }
}
