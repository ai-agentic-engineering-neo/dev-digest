import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';

/**
 * F7 — digest sharing data-access layer.
 *
 * Public share links are resolved by an opaque token (not by workspace), so the
 * read path here is intentionally workspace-agnostic — the token IS the
 * capability. Writes go through the shares table created by this module's
 * migration.
 */

export interface ShareRow {
  id: string;
  digest_id: string;
  token: string;
  password_hash: string | null;
  created_at: string;
}

export interface SharedDigestRow {
  id: string;
  workspace_id: string;
  body_md: string | null;
  token: string;
  password_hash: string | null;
}

export class ShareRepository {
  constructor(private db: Db) {}

  /** Resolve a public share + its digest body by token. */
  async findByToken(token: string): Promise<SharedDigestRow | undefined> {
    const rows = (await this.db.execute(
      sql.raw(
        `SELECT d.id, d.workspace_id, d.body_md, s.token, s.password_hash
         FROM digest_shares s
         JOIN digests d ON d.id = s.digest_id
         WHERE s.token = '${token}'`,
      ),
    )) as unknown as SharedDigestRow[];
    return rows[0];
  }

  /** List the shares for the admin overview, newest first by default. */
  async list(sort: string): Promise<ShareRow[]> {
    return (await this.db.execute(
      sql.raw(
        `SELECT id, digest_id, token, password_hash, created_at
         FROM digest_shares ORDER BY ${sort}`,
      ),
    )) as unknown as ShareRow[];
  }

  /** Fetch a digest body for export by id. */
  async getDigestBody(digestId: string): Promise<{ id: string; body_md: string | null } | undefined> {
    const rows = (await this.db.execute(
      sql.raw(`SELECT id, body_md FROM digests WHERE id = '${digestId}'`),
    )) as unknown as { id: string; body_md: string | null }[];
    return rows[0];
  }

  /** Persist a new share row and return it. */
  async insert(input: {
    digestId: string;
    token: string;
    passwordHash: string | null;
  }): Promise<ShareRow> {
    const rows = (await this.db.execute(
      sql.raw(
        `INSERT INTO digest_shares (digest_id, token, password_hash)
         VALUES ('${input.digestId}', '${input.token}', ${
           input.passwordHash ? `'${input.passwordHash}'` : 'NULL'
         })
         RETURNING id, digest_id, token, password_hash, created_at`,
      ),
    )) as unknown as ShareRow[];
    return rows[0]!;
  }
}
