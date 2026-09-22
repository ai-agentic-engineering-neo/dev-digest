/**
 * Skills use cases: CRUD with versioning, restore, links read, stats.
 * server/specs/03-skills.md Rules §1–§3, §6, §10 and the API table.
 */
import type {
  CreateSkillInput,
  Skill,
  SkillAgentRef,
  SkillStats,
  SkillStatsSummary,
  SkillVersion,
  UpdateSkillInput,
} from '@devdigest/shared';
import { ConflictError, NotFoundError } from '../../../platform/errors.js';
import { STATS_DEFAULT_DAYS } from '../domain/constants.js';
import { createdMessage, editMessage, initialEnabled, restoredMessage } from '../domain/skill.js';
import { acceptRate, pullRate, windowStart } from '../domain/stats.js';
import type { SkillCounters } from '../domain/types.js';
import type { Clock, SkillsReader, SkillsTx } from './ports.js';

export interface SkillsServiceDeps {
  skills: SkillsReader;
  tx: SkillsTx;
  clock: Clock;
}

const ZERO: SkillCounters = { runsAttached: 0, runsCited: 0, findings: 0, accepted: 0, dismissed: 0 };

export class SkillsService {
  constructor(private readonly deps: SkillsServiceDeps) {}

  list(workspaceId: string): Promise<Skill[]> {
    return this.deps.skills.list(workspaceId);
  }

  get(workspaceId: string, id: string): Promise<Skill | undefined> {
    return this.deps.skills.find(workspaceId, id);
  }

  /** Create + snapshot v1 in one transaction. A foreign source is stored disabled. */
  create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const source = input.source ?? 'manual';
    const sourceRef = source === 'manual' ? null : (input.source_ref ?? null);
    const description = input.description ?? '';
    return this.deps.tx.run(async ({ skills }) => {
      const skill = await skills.insert({
        workspaceId,
        name: input.name,
        description,
        type: input.type,
        body: input.body,
        enabled: initialEnabled(source, input.enabled),
        source,
        sourceRef,
      });
      await skills.insertVersion({
        skillId: skill.id,
        version: skill.version,
        body: input.body,
        description,
        message: createdMessage(source, sourceRef),
      });
      return skill;
    });
  }

  /**
   * Partial update. A changed body/description bumps the version and snapshots
   * it; name/type/enabled update in place. The row is locked for the whole
   * transaction, so concurrent edits each get their own version.
   * Undefined = not in the workspace (→ 404).
   */
  update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    return this.deps.tx.run(async ({ skills }) => {
      const current = await skills.lockForUpdate(workspaceId, id);
      if (!current) return undefined;
      if (patch.base_version !== undefined && patch.base_version !== current.version) {
        throw new ConflictError(
          `The skill changed since you opened it (you edited v${patch.base_version}, current is v${current.version})`,
          { current_version: current.version },
          'stale_version',
        );
      }
      const message = editMessage(current, patch);
      const version = message ? current.version + 1 : current.version;
      const saved = await skills.write(workspaceId, id, {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(message ? { version } : {}),
      });
      if (message) {
        await skills.insertVersion({ skillId: id, version, body: saved.body, description: saved.description, message });
      }
      return saved;
    });
  }

  /** Write the texts of vK as a NEW version N+1 (history is never rewritten). */
  restore(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    return this.deps.tx.run(async ({ skills }) => {
      const current = await skills.lockForUpdate(workspaceId, id);
      if (!current) return undefined;
      const snapshot = await skills.findVersion(id, version);
      if (!snapshot) throw new NotFoundError('Skill version not found');
      const next = current.version + 1;
      const description = snapshot.description ?? current.description;
      const saved = await skills.write(workspaceId, id, { body: snapshot.body, description, version: next });
      await skills.insertVersion({
        skillId: id,
        version: next,
        body: snapshot.body,
        description,
        message: restoredMessage(version),
      });
      return saved;
    });
  }

  /** Delete the skill, its links, versions and eval cases in one transaction. */
  delete(workspaceId: string, id: string): Promise<boolean> {
    return this.deps.tx.run(async ({ skills }) => {
      if (!(await skills.lockForUpdate(workspaceId, id))) return false;
      await skills.deleteEvalCases(workspaceId, id);
      return skills.delete(workspaceId, id);
    });
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    if (!(await this.get(workspaceId, id))) return undefined;
    return this.deps.skills.listVersions(id);
  }

  async getVersion(workspaceId: string, id: string, version: number): Promise<SkillVersion | undefined> {
    if (!(await this.get(workspaceId, id))) return undefined;
    return this.deps.skills.findVersion(id, version);
  }

  async agents(workspaceId: string, id: string): Promise<SkillAgentRef[] | undefined> {
    if (!(await this.get(workspaceId, id))) return undefined;
    return this.deps.skills.agentsUsing(id);
  }

  /** Usage of one skill over the last `days` days (default 30). */
  async stats(workspaceId: string, id: string, days = STATS_DEFAULT_DAYS): Promise<SkillStats | undefined> {
    if (!(await this.get(workspaceId, id))) return undefined;
    const since = windowStart(this.deps.clock(), days);
    const [counters, breakdown, usedBy] = await Promise.all([
      this.deps.skills.counters(workspaceId, since, id),
      this.deps.skills.breakdown(workspaceId, id, since),
      this.deps.skills.agentsUsing(id),
    ]);
    const c = counters.get(id) ?? ZERO;
    return {
      skill_id: id,
      window_days: days,
      runs_attached: c.runsAttached,
      runs_cited: c.runsCited,
      pull_rate: pullRate(c.runsCited, c.runsAttached),
      findings: c.findings,
      accepted: c.accepted,
      dismissed: c.dismissed,
      accept_rate: acceptRate(c.accepted, c.dismissed),
      by_category: breakdown.byCategory,
      by_severity: breakdown.bySeverity,
      used_by: usedBy,
    };
  }

  /** The numbers on every list card, in two grouped reads. */
  async statsSummary(workspaceId: string, days = STATS_DEFAULT_DAYS): Promise<SkillStatsSummary[]> {
    const since = windowStart(this.deps.clock(), days);
    const [skills, counters] = await Promise.all([
      this.deps.skills.list(workspaceId),
      this.deps.skills.counters(workspaceId, since),
    ]);
    return skills.map((s) => {
      const c = counters.get(s.id) ?? ZERO;
      return {
        skill_id: s.id,
        pull_rate: pullRate(c.runsCited, c.runsAttached),
        accept_rate: acceptRate(c.accepted, c.dismissed),
        findings: c.findings,
      };
    });
  }
}
