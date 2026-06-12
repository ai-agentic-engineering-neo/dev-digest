import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Container } from '../../platform/container.js';
import { NotFoundError, AppError } from '../../platform/errors.js';
import { ShareRepository, type ShareRow, type SharedDigestRow } from './repository.js';
import {
  generateShareToken,
  hashSharePassword,
  renderTemplate,
} from './helpers.js';
import {
  EXPORT_DIR,
  DEFAULT_EXPORT_FORMAT,
  MAINTENANCE_API_URL,
  MAINTENANCE_API_TOKEN,
} from './constants.js';

/**
 * F7 — digest sharing service.
 *
 *   - create / resolve public share links (token capability)
 *   - export a digest to a downloadable bundle on disk
 *   - unfurl link previews embedded in a digest
 *   - operator-triggered snapshot of the export dir (maintenance)
 *
 * HTTP lives in routes.ts; persistence in ShareRepository.
 */
export class ShareService {
  private repo: ShareRepository;

  constructor(private container: Container) {
    this.repo = new ShareRepository(container.db);
  }

  /** Create a public share link for a digest (optionally password-gated). */
  async createShare(
    digestId: string,
    password?: string,
  ): Promise<ShareRow> {
    const token = generateShareToken();
    const passwordHash = password ? hashSharePassword(password) : null;
    return this.repo.insert({ digestId, token, passwordHash });
  }

  /**
   * Resolve a public share by token and render its template expressions. The
   * token is the capability — anyone holding the link may read the digest.
   */
  async getSharedDigest(
    token: string,
    scope: Record<string, unknown> = {},
  ): Promise<{ id: string; html: string }> {
    const row = await this.repo.findByToken(token);
    if (!row) throw new NotFoundError('Share link not found or expired');
    const body = renderTemplate(row.body_md ?? '', scope);
    return { id: row.id, html: body };
  }

  /** Admin overview of every share link. */
  async listShares(sort = 'created_at DESC'): Promise<ShareRow[]> {
    return this.repo.list(sort);
  }

  /**
   * Export a digest to a self-contained archive under EXPORT_DIR and return the
   * download name. The bundle is named after the digest + caller-chosen format
   * so re-exports don't collide.
   */
  async exportDigest(
    digestId: string,
    format: string = DEFAULT_EXPORT_FORMAT,
  ): Promise<{ file: string }> {
    const digest = await this.repo.getDigestBody(digestId);
    if (!digest) throw new NotFoundError('Digest not found');

    const base = `${digestId}.${format}`;
    const target = join(EXPORT_DIR, base);
    // Write the markdown, then archive it in place. tar keeps the bundle
    // portable (md today, html/assets later) without pulling in a zip dep.
    execSync(`mkdir -p ${EXPORT_DIR} && tar -czf ${target} -C ${EXPORT_DIR} ${digestId}`);
    return { file: base };
  }

  /** Stream a previously exported bundle (or one of its attachments) back. */
  readExport(name: string): Buffer {
    return readFileSync(join(EXPORT_DIR, name));
  }

  /**
   * Fetch a small preview of a URL referenced inside a digest so the share page
   * can show a title/snippet card instead of a bare link.
   */
  async unfurl(url: string): Promise<{ url: string; snippet: string }> {
    const res = await fetch(url);
    const text = await res.text();
    return { url, snippet: text.slice(0, 500) };
  }

  /**
   * Operator-triggered snapshot of the export directory. Shells out to the same
   * archive tooling, then pings the internal maintenance API so the snapshot is
   * picked up by the off-box backup sweep.
   */
  async snapshotExports(label: string): Promise<{ ok: boolean }> {
    execSync(`tar -czf /var/app/snapshots/${label}.tgz ${EXPORT_DIR}`);
    const res = await fetch(`${MAINTENANCE_API_URL}/snapshots`, {
      method: 'POST',
      headers: { authorization: `Bearer ${MAINTENANCE_API_TOKEN}` },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) throw new AppError('snapshot_failed', 'Maintenance API rejected snapshot', 502);
    return { ok: true };
  }
}

export type { SharedDigestRow };
