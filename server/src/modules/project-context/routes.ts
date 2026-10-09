import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  SetAttachedDocumentRequest,
  SetAttachedDocumentsRequest,
  SetDocRootsRequest,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * specs/09-project-context-folder.md — Project Context Folder routes.
 *
 *   GET  /repos/:id/context/documents          → discovery listing + summary
 *   GET  /repos/:id/context/documents/one       → read-only content preview
 *   PUT  /repos/:id/context/config              → set search roots (Q1/Q2)
 *   GET|POST|PUT /agents/:id/documents          → attachments (list / set·reorder / toggle one)
 *   GET|POST|PUT /skills/:id/documents          → same three, for a skill
 *
 * `documents` (not `context-docs`) keeps the paths readable and cannot
 * collide with the agents module's own `/agents/:id/skills` routes — two
 * plugins registering different paths under the same prefix is fine.
 *
 * Every write verifies agent/skill/repo ownership against `workspaceId`
 * before touching a row, so an attachment can never point at another
 * workspace's repo (`ProjectContextService.assertOwnedRepos`).
 */

const DocumentQuery = z.object({ path: z.string().min(1) });

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.projectContextService;

  // ---- Discovery & browsing (view-only) ------------------------------

  app.get('/repos/:id/context/documents', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const list = await service.listDocuments(workspaceId, req.params.id);
    if (!list) throw new NotFoundError('Repo not found');
    return list;
  });

  app.get(
    '/repos/:id/context/documents/one',
    { schema: { params: IdParams, querystring: DocumentQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const doc = await service.getDocument(workspaceId, req.params.id, req.query.path);
      if (!doc) throw new NotFoundError('Document not found');
      return doc;
    },
  );

  app.put(
    '/repos/:id/context/config',
    { schema: { params: IdParams, body: SetDocRootsRequest } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const roots = await service.setDocRoots(workspaceId, req.params.id, req.body.doc_roots);
      if (!roots) throw new NotFoundError('Repo not found');
      return { doc_roots: roots };
    },
  );

  // ---- Agent attachments ----------------------------------------------

  app.get('/agents/:id/documents', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const docs = await service.listAgentDocuments(workspaceId, req.params.id);
    if (!docs) throw new NotFoundError('Agent not found');
    return docs;
  });

  app.post(
    '/agents/:id/documents',
    { schema: { params: IdParams, body: SetAttachedDocumentsRequest } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const docs = await service.setAgentDocuments(
        workspaceId,
        req.params.id,
        req.body.documents.map((d) => ({ repoId: d.repo_id, path: d.path })),
      );
      if (!docs) throw new NotFoundError('Agent not found');
      return docs;
    },
  );

  // Toggle ONE attachment's `attached` flag — deliberately NOT a DELETE:
  // detaching keeps the row so `order` survives, and re-attaching restores
  // its position (AC-10).
  app.put(
    '/agents/:id/documents',
    { schema: { params: IdParams, body: SetAttachedDocumentRequest } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const docs = await service.setAgentDocumentAttached(
        workspaceId,
        req.params.id,
        req.body.repo_id,
        req.body.path,
        req.body.attached,
      );
      if (!docs) throw new NotFoundError('Agent not found');
      return docs;
    },
  );

  // ---- Skill attachments (mirrors the agent routes above) --------------

  app.get('/skills/:id/documents', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const docs = await service.listSkillDocuments(workspaceId, req.params.id);
    if (!docs) throw new NotFoundError('Skill not found');
    return docs;
  });

  app.post(
    '/skills/:id/documents',
    { schema: { params: IdParams, body: SetAttachedDocumentsRequest } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const docs = await service.setSkillDocuments(
        workspaceId,
        req.params.id,
        req.body.documents.map((d) => ({ repoId: d.repo_id, path: d.path })),
      );
      if (!docs) throw new NotFoundError('Skill not found');
      return docs;
    },
  );

  app.put(
    '/skills/:id/documents',
    { schema: { params: IdParams, body: SetAttachedDocumentRequest } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const docs = await service.setSkillDocumentAttached(
        workspaceId,
        req.params.id,
        req.body.repo_id,
        req.body.path,
        req.body.attached,
      );
      if (!docs) throw new NotFoundError('Skill not found');
      return docs;
    },
  );
}
