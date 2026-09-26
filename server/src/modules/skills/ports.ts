/**
 * skills — ports (ring 1).
 *
 * The interfaces the service depends on. `repository.ts` implements the
 * repository port; `platform/container.ts` owns the instance; `routes.ts`
 * assembles `SkillsDeps` from the container. Plain types only: no drizzle,
 * no `Db`, no fastify, no `Container`.
 */
import type {
  Skill,
  SkillImportPreview as SharedSkillImportPreview,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import type { CREATABLE_SKILL_SOURCES } from './constants.js';

/** Sources the HTTP API may set; internal callers (conventions extractor) may also set `extracted`. */
export type CreatableSkillSource = (typeof CREATABLE_SKILL_SOURCES)[number] | 'extracted';

/** DTO that crosses the port: the shared `Skill` contract, snake_case like the API. */
export type SkillDto = Skill;

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  /** Defaults to `manual`; the import flow sets `imported_file` on confirm. */
  source?: CreatableSkillSource;
}

/** What the import preview shows before anything is saved: the shared contract. */
export type SkillImportPreview = SharedSkillImportPreview;

/** One `skill_versions` row: the shared contract. */
export type SkillVersionDto = SkillVersion;

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export interface SkillsRepositoryPort {
  list(workspaceId: string): Promise<SkillDto[]>;
  getById(workspaceId: string, id: string): Promise<SkillDto | undefined>;
  findByName(workspaceId: string, name: string): Promise<SkillDto | undefined>;
  /** Insert the skill and record version 1, atomically. */
  create(workspaceId: string, input: CreateSkillInput): Promise<SkillDto>;
  /**
   * Apply the patch; when `bumpVersion` is set, increment `version` and record
   * the new body in `skill_versions` in the same transaction. The service
   * decides whether a new version is warranted; the repository owns the write.
   */
  update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
    opts: { bumpVersion: boolean },
  ): Promise<SkillDto | undefined>;
  /** Delete the skill; agent links and versions cascade. False when absent. */
  delete(workspaceId: string, id: string): Promise<boolean>;
  /** All body snapshots of a skill, newest first; [] for an unknown skill. */
  listVersions(workspaceId: string, id: string): Promise<SkillVersionDto[]>;
  /** One snapshot, or undefined when the skill or that version does not exist. */
  getVersion(workspaceId: string, id: string, version: number): Promise<SkillVersionDto | undefined>;
}

/** Everything the service needs, by constructor. Tests pass fakes here. */
export interface SkillsDeps {
  repo: SkillsRepositoryPort;
}
