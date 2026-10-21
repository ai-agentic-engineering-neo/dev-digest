/**
 * skills — application service (ring 2).
 *
 * Business rules for skills. Depends on `SkillsDeps` (ports), never on
 * `Container`, Drizzle or fastify. Throws `AppError` subclasses; `app.ts`
 * turns them into the HTTP envelope.
 */
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { MAX_BODY_CHARS } from './constants.js';
import { isMeaningfulChange } from './helpers.js';
import type { CreateSkillInput, SkillDto, SkillsDeps } from './ports.js';

export class SkillsService {
  constructor(private readonly deps: SkillsDeps) {}

  list(workspaceId: string): Promise<SkillDto[]> {
    return this.deps.repo.list(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<SkillDto> {
    const skill = await this.deps.repo.getById(workspaceId, id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<SkillDto> {
    this.assertBodyFits(input.body);
    return this.deps.repo.create(workspaceId, input);
  }

  /**
   * Returns the current skill unchanged when the edit is whitespace only;
   * otherwise bumps the version atomically through the port.
   */
  async updateBody(workspaceId: string, id: string, body: string): Promise<SkillDto> {
    this.assertBodyFits(body);
    const current = await this.get(workspaceId, id);
    if (!isMeaningfulChange(current.body, body)) return current;
    const next = await this.deps.repo.saveNewVersion(workspaceId, id, body);
    if (!next) throw new NotFoundError('Skill not found');
    return next;
  }

  private assertBodyFits(body: string): void {
    if (body.length > MAX_BODY_CHARS) {
      throw new ValidationError(`Skill body exceeds ${MAX_BODY_CHARS} characters`, {
        length: body.length,
      });
    }
  }
}
