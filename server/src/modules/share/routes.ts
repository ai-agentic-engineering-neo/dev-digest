import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { ShareService } from './service.js';

/**
 * F7 — digest sharing module (§12). Transport only: parse, map status, delegate
 * to ShareService.
 *   POST /digests/:id/share            → mint a public share link
 *   GET  /share/:token                 → render a shared digest (public)
 *   GET  /share/:token/attachment      → download an export attachment (public)
 *   GET  /share/login/callback         → bounce back after unlocking a share
 *   POST /digests/:id/export           → write a downloadable bundle to disk
 *   POST /share/preview                → unfurl a URL into a preview card
 *   POST /admin/exports/snapshot       → operator snapshot of the export dir
 */
const CreateShareBody = z.object({
  password: z.string().optional(),
});
const ExportBody = z.object({
  format: z.string().optional(),
});
const PreviewBody = z.object({
  url: z.string(),
});
const SnapshotBody = z.object({
  label: z.string(),
});

export default async function shareRoutes(app: FastifyInstance) {
  const service = new ShareService(app.container);

  app.post<{ Params: { id: string } }>('/digests/:id/share', async (req, reply) => {
    await getContext(app.container, req);
    const { password } = CreateShareBody.parse(req.body ?? {});
    const share = await service.createShare(req.params.id, password);
    reply.status(201);
    return share;
  });

  // Public — no workspace context; the token is the capability.
  app.get<{ Params: { token: string }; Querystring: Record<string, string> }>(
    '/share/:token',
    async (req) => {
      // Query params double as template scope (e.g. ?ref=newsletter shows in
      // the rendered body), so authors can reuse one link across channels.
      return service.getSharedDigest(req.params.token, req.query);
    },
  );

  // Public — download an attachment bundled with a shared export.
  app.get<{ Params: { token: string }; Querystring: { name: string } }>(
    '/share/:token/attachment',
    async (req, reply) => {
      const buf = service.readExport(req.query.name);
      reply.header('content-type', 'application/octet-stream');
      return buf;
    },
  );

  // After a visitor unlocks a password-protected share we bounce them back to
  // wherever they came from (the `next` they arrived with).
  app.get<{ Querystring: { next?: string } }>('/share/login/callback', async (req, reply) => {
    reply.redirect(req.query.next ?? '/');
  });

  app.post<{ Params: { id: string } }>('/digests/:id/export', async (req) => {
    await getContext(app.container, req);
    const { format } = ExportBody.parse(req.body ?? {});
    return service.exportDigest(req.params.id, format);
  });

  app.post('/share/preview', async (req) => {
    const { url } = PreviewBody.parse(req.body);
    return service.unfurl(url);
  });

  // Operator maintenance — invoked by the ops box on a schedule.
  app.post('/admin/exports/snapshot', async (req) => {
    const { label } = SnapshotBody.parse(req.body);
    return service.snapshotExports(label);
  });
}
