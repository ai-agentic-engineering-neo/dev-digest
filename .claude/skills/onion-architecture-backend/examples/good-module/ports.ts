/**
 * skills — ports (ring 1).
 *
 * The interfaces the service depends on. `repository.ts` implements the
 * repository port; `platform/container.ts` owns the instance; `routes.ts`
 * assembles `SkillsDeps` from the container. Plain types only: no drizzle,
 * no `Db`, no fastify, no `Container`.
 */
import type { SKILL_SOURCES, SKILL_TYPES } from './constants.js';

export type SkillType = (typeof SKILL_TYPES)[number];
export type SkillSource = (typeof SKILL_SOURCES)[number];

/**
 * DTO that crosses the port. snake_case like the API, so routes return it as
 * is. Promote to a Zod schema in `vendor/shared/contracts/` when the client
 * consumes it.
 */
export interface SkillDto {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  version: number;
  created_at: string;
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export interface SkillsRepositoryPort {
  list(workspaceId: string): Promise<SkillDto[]>;
  getById(workspaceId: string, id: string): Promise<SkillDto | undefined>;
  create(workspaceId: string, input: CreateSkillInput): Promise<SkillDto>;
  /**
   * Replace the body and record the previous version, atomically. The
   * service decides whether a new version is warranted; the repository owns
   * the transaction.
   */
  saveNewVersion(workspaceId: string, id: string, body: string): Promise<SkillDto | undefined>;
}

/** Everything the service needs, by constructor. Tests pass fakes here. */
export interface SkillsDeps {
  repo: SkillsRepositoryPort;
}
