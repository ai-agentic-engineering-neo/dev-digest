import type { NewNote, Note } from '../domain-model/note.js';

/** Opaque transaction handle — only infrastructure knows it is a Drizzle tx. */
export type TxHandle = { readonly __tx: unique symbol };

export interface UnitOfWork {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T>;
}

/** Named after what the core needs, not the technology. Every method is workspace-scoped. */
export interface NoteStore {
  findByTitle(workspaceId: string, title: string, tx?: TxHandle): Promise<Note | undefined>;
  insert(note: NewNote, tx?: TxHandle): Promise<Note>;
}
