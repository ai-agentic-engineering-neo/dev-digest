/**
 * Domain shapes of the skills module (write models + read models the use cases
 * pass around). No DB row types: the repository maps its rows onto these.
 */
import type { SkillSource, SkillType } from '@devdigest/shared';

/** A skill to insert (v1 is snapshotted with it). */
export interface NewSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  source: SkillSource;
  sourceRef: string | null;
}

/** Fields written by an update; `version` set only on a versioned change. */
export interface SkillWrite {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  version?: number;
}

/** One immutable snapshot row. */
export interface NewSkillVersion {
  skillId: string;
  version: number;
  body: string;
  description: string;
  message: string;
}

/** Raw per-skill counters the stats read model is computed from. */
export interface SkillCounters {
  runsAttached: number;
  runsCited: number;
  findings: number;
  accepted: number;
  dismissed: number;
}

/** A skill as attached to a run: what the prompt block and the trace need. */
export interface AttachedSkill {
  id: string;
  name: string;
  description: string;
  body: string;
  version: number;
}
