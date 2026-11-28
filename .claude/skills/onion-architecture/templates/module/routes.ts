import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { NoteInput, type NoteDto } from '@devdigest/shared'; // TEMPLATE: add the contract file first
import { getContext } from '../_shared/context.js';
import type { Note } from './domain-model/note.js';
import { composeNotes } from './compose.js';

const toNoteDto = (n: Note): NoteDto => ({ id: n.id, title: n.title, archived: n.archived });

/** UI ring: parse → one use-case call → status → DTO. No Drizzle, no business ifs. */
export default async function notesRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const uc = composeNotes(app.container);

  app.post('/notes', { schema: { body: NoteInput } }, async (req, reply) => {
    const ctx = await getContext(app.container, req);
    const { note, created } = await uc.createNote.execute(ctx, req.body.title);
    reply.status(created ? 201 : 200);
    return toNoteDto(note);
  });
}
