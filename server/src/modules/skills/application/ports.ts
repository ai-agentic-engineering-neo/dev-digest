/**
 * Ports of the skills use cases. Infrastructure implements them
 * (SkillsRepository, the zip reader, the guarded fetcher, the catalog); the
 * composition root wires the real ones and tests pass fakes.
 */
import type { CountBy, Skill, SkillAgentRef, SkillVersion } from '@devdigest/shared';
import type { TransactionRunner } from '../../../application/transaction.js';
import type { CatalogEntry } from '../domain/catalog.js';
import type { ArchiveEntry } from '../domain/import.js';
import type { NewSkill, NewSkillVersion, SkillCounters, SkillWrite } from '../domain/types.js';

/** Reads (workspace-scoped where the id comes from the client). */
export interface SkillsReader {
  list(workspaceId: string): Promise<Skill[]>;
  find(workspaceId: string, id: string): Promise<Skill | undefined>;
  /** Snapshots of one skill, newest first. */
  listVersions(skillId: string): Promise<SkillVersion[]>;
  findVersion(skillId: string, version: number): Promise<SkillVersion | undefined>;
  /** Agents linking the skill, by name. */
  agentsUsing(skillId: string): Promise<SkillAgentRef[]>;
  /** Stats counters per skill of the workspace since `since` (absent skill = all zero). */
  counters(workspaceId: string, since: Date, skillId?: string): Promise<Map<string, SkillCounters>>;
  /** Findings citing the skill since `since`, grouped by category and by severity. */
  breakdown(workspaceId: string, skillId: string, since: Date): Promise<{ byCategory: CountBy[]; bySeverity: CountBy[] }>;
}

/** Writes that run inside one transaction (see SkillsTx). */
export interface SkillsWriter {
  /** Insert a skill; a duplicate name throws ConflictError('conflict'). */
  insert(values: NewSkill): Promise<Skill>;
  /** The skill row locked FOR UPDATE (undefined = not in the workspace). */
  lockForUpdate(workspaceId: string, id: string): Promise<Skill | undefined>;
  /** Write fields + bump updated_at; a duplicate name throws ConflictError('conflict'). */
  write(workspaceId: string, id: string, values: SkillWrite): Promise<Skill>;
  insertVersion(values: NewSkillVersion): Promise<void>;
  findVersion(skillId: string, version: number): Promise<SkillVersion | undefined>;
  /** Delete the skill (links + versions + run links cascade; findings keep their name). */
  delete(workspaceId: string, id: string): Promise<boolean>;
  /** Eval cases owned by the skill (`owner_kind='skill'`) — no FK, so explicit. */
  deleteEvalCases(workspaceId: string, skillId: string): Promise<void>;
}

export type SkillsTx = TransactionRunner<{ skills: SkillsWriter }>;

/** Reads a `.zip` by entry name; never extracts to disk, never runs anything. */
export interface ArchiveReader {
  /** Entry names + uncompressed sizes (no content is inflated). Throws on a corrupt archive. */
  list(bytes: Uint8Array): ArchiveEntry[];
  /** Inflate ONE entry as UTF-8 text; throws when it exceeds `maxBytes`. */
  readText(bytes: Uint8Array, path: string, maxBytes: number): string;
}

/** A fetched import URL (after the SSRF-guarded redirects). */
export interface FetchedDocument {
  bytes: Uint8Array;
  contentType: string | null;
  finalUrl: string;
}

/** HTTPS GET behind the SSRF guard (public addresses only, bounded, manual redirects). */
export interface UrlFetcher {
  fetch(url: URL): Promise<FetchedDocument>;
}

/** The vetted community catalog shipped with the server (no network). */
export interface CommunityCatalog {
  list(): readonly CatalogEntry[];
  get(id: string): CatalogEntry | undefined;
}

/** Wall clock (injectable for tests). */
export type Clock = () => Date;
