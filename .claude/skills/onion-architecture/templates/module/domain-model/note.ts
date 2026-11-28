import { ValidationError } from '../../../platform/errors.js';

/** Entity owned by the module — not the API DTO, not the Drizzle row. */
export interface Note {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly archived: boolean;
}

export interface NewNote {
  workspaceId: string;
  title: string;
}

const MAX_TITLE = 200;

/** Factory enforces invariants; inner code can trust any NewNote it receives. */
export function newNote(workspaceId: string, rawTitle: string): NewNote {
  const title = rawTitle.trim();
  if (!title) throw new ValidationError('Title is required');
  if (title.length > MAX_TITLE) throw new ValidationError(`Title is longer than ${MAX_TITLE} chars`);
  return { workspaceId, title };
}

/** Behaviour lives on the model, not in helpers.ts (avoid an anemic domain). */
export function canEdit(note: Note): boolean {
  return !note.archived;
}
