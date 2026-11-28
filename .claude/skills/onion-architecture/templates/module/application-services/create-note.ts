import { AppError } from '../../../platform/errors.js';
import { newNote, type Note } from '../domain-model/note.js';
import type { NoteStore, UnitOfWork } from '../domain-services/ports.js';

export class CreateNote {
  constructor(
    private notes: NoteStore,
    private uow: UnitOfWork,
  ) {}

  async execute(ctx: { workspaceId: string }, title: string): Promise<{ note: Note; created: boolean }> {
    const draft = newNote(ctx.workspaceId, title);
    return this.uow.run(async (tx) => {
      const existing = await this.notes.findByTitle(ctx.workspaceId, draft.title, tx);
      if (existing) return { note: existing, created: false };
      return { note: await this.notes.insert(draft, tx), created: true };
    });
  }
}

// TEMPLATE: domain-specific failures extend AppError (platform/errors.ts) so the global handler maps them.
export class NoteLimitReached extends AppError {}
