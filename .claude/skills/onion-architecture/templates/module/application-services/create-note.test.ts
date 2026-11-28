import { describe, expect, it } from 'vitest';
import type { NewNote, Note } from '../domain-model/note.js';
import type { NoteStore, TxHandle, UnitOfWork } from '../domain-services/ports.js';
import { CreateNote } from './create-note.js';

/** Fake = working in-memory implementation of the port (prefer over vi.mock). */
class InMemoryNoteStore implements NoteStore {
  rows: Note[] = [];
  async findByTitle(ws: string, title: string) {
    return this.rows.find((n) => n.workspaceId === ws && n.title === title);
  }
  async insert(n: NewNote) {
    const note: Note = { ...n, id: String(this.rows.length + 1), archived: false };
    this.rows.push(note);
    return note;
  }
}
const fakeUow: UnitOfWork = { run: (fn) => fn({} as TxHandle) };

describe('CreateNote', () => {
  it('dedupes by title within a workspace — no Docker needed', async () => {
    const store = new InMemoryNoteStore();
    const uc = new CreateNote(store, fakeUow);
    await uc.execute({ workspaceId: 'w1' }, ' Hello ');
    const second = await uc.execute({ workspaceId: 'w1' }, 'Hello');
    expect(second.created).toBe(false);
    expect(store.rows).toHaveLength(1);
  });
});
