import type { Container } from '../../platform/container.js';
import { CreateNote } from './application-services/create-note.js';
import { DrizzleNoteStore, DrizzleUnitOfWork } from './infrastructure/note.drizzle-store.js';

/** Composition root of the module: the only file (besides routes wiring) that sees Container. */
export function composeNotes(c: Container) {
  const store = new DrizzleNoteStore(c.db);
  const uow = new DrizzleUnitOfWork(c.db);
  return { createNote: new CreateNote(store, uow) };
}
