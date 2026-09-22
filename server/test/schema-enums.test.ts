import { describe, it, expect } from 'vitest';
import {
  Severity,
  FindingCategory,
  FindingKind,
  PrStatus,
  Provider,
  ReviewStrategy,
  CiFailOn,
  SkillType,
  SkillSource,
  MemoryScope,
  MemoryKind,
  EvalOwnerKind,
  CiTarget,
} from '@devdigest/shared';
import * as t from '../src/db/schema.js';

/**
 * The DB CHECK constraints (migration 0011) are generated from the schema's
 * value lists. Those lists must match the shared zod contracts — otherwise a
 * value the API accepts would be rejected by Postgres (or vice versa).
 */
describe('schema enum value lists match the shared contracts', () => {
  const pairs: Array<[string, readonly string[], readonly string[]]> = [
    ['findings.severity', t.FINDING_SEVERITIES, Severity.options],
    ['findings.category', t.FINDING_CATEGORIES, FindingCategory.options],
    ['findings.kind', t.FINDING_KINDS, FindingKind.options],
    ['pull_requests.status', t.PR_STATUSES, PrStatus.options],
    ['agents.provider', t.AGENT_PROVIDERS, Provider.options],
    ['agents.strategy', t.AGENT_STRATEGIES, ReviewStrategy.options],
    ['agents.ci_fail_on', t.AGENT_CI_FAIL_ON, CiFailOn.options],
    ['skills.type', t.SKILL_TYPES, SkillType.options],
    ['skills.source', t.SKILL_SOURCES, SkillSource.options],
    ['memory.scope', t.MEMORY_SCOPES, MemoryScope.options],
    ['memory.kind', t.MEMORY_KINDS, MemoryKind.options],
    ['eval_cases.owner_kind', t.EVAL_OWNER_KINDS, EvalOwnerKind.options],
    ['ci_installations.target_type', t.CI_TARGET_TYPES, CiTarget.options],
  ];

  it.each(pairs)('%s', (_name, schemaValues, contractValues) => {
    expect([...schemaValues].sort()).toEqual([...contractValues].sort());
  });
});
