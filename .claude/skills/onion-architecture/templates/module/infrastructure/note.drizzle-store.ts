import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { NewNote, Note } from '../domain-model/note.js';
import type { NoteStore, TxHandle, UnitOfWork } from '../domain-services/ports.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
const exec = (db: Db, tx?: TxHandle): Db | Tx => (tx as unknown as Tx | undefined) ?? db;

// TEMPLATE: replace t.notes with your table. The row type never leaves this file.
type NoteRow = typeof t.notes.$inferSelect;
const toDomain = (r: NoteRow): Note => ({ id: r.id, workspaceId: r.workspaceId, title: r.title, archived: r.archived });

export class DrizzleNoteStore implements NoteStore {
  constructor(private db: Db) {}

  async findByTitle(workspaceId: string, title: string, tx?: TxHandle) {
    const [row] = await exec(this.db, tx)
      .select()
      .from(t.notes)
      .where(and(eq(t.notes.workspaceId, workspaceId), eq(t.notes.title, title)));
    return row && toDomain(row);
  }

  async insert(n: NewNote, tx?: TxHandle) {
    const [row] = await exec(this.db, tx).insert(t.notes).values(n).returning();
    return toDomain(row!);
  }
}

export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private db: Db) {}
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(tx as unknown as TxHandle));
  }
}
