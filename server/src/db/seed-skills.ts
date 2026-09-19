import { and, eq } from 'drizzle-orm';
import type { SkillType } from '@devdigest/shared';
import type { Db } from './client.js';
import * as t from './schema.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { SkillsRepository } from '../modules/skills/repository.js';

/** Bodies for Test Quality’s three seeded skills — reused by hermetic prompt tests. */
export const UNCOVERED_BRANCHES_BODY = `# Uncovered branches
Flag new production branches or paths (\`if\`/\`else\`, \`switch\`, \`catch\`, early return)
that the test file does not assert. Cite the untested branch.`;

export const CORNER_CASES_BODY = `# Corner cases
Flag missing empty, null, invalid, error, and boundary assertions for new helpers
and handlers. A happy-path-only test is a finding.`;

export const EXCESSIVE_MOCKING_BODY = `# Excessive mocking
Flag mocks that replace the unit under test or hide the real behaviour the test
claims to cover. Do not flag narrow collaborator stubs.`;

export const TEST_QUALITY_SKILL_BODIES = [
  UNCOVERED_BRANCHES_BODY,
  CORNER_CASES_BODY,
  EXCESSIVE_MOCKING_BODY,
];

export const BREAKING_CHANGE_BODY = `# Breaking change
Flag a change or deletion of a **public** contract: renamed or removed route,
method, path param, or JSON field that existing clients send or read.

## Bad
Rename \`userId\` to \`user_id\` (or delete the field) with no alias on the same path.

## Good
Keep the old field, or ship \`/v2/\` (or a major bump) and leave \`/v1/\` until sunset.`;

export const RESPONSE_SCHEMA_BODY = `# Response schema
Flag response **shape** drift: type change, newly required response field,
optional becoming required, nullability, or enum narrowing.

## Bad
\`email: string\` becomes \`email: string | null\` (or the reverse: clients that
sent \`null\` now get 400).

## Good
Add an **optional** field. Do not remove or rename an existing one.`;

export const SEMVER_DISCIPLINE_BODY = `# Semver discipline
Flag a breaking contract change with no major version bump (URL prefix, package
version, or changelog BREAKING).

## Bad
Breaking rename on the same \`/v1/\` path, patch bump only.

## Good
Breaking change only on \`/v2/\` (or a documented major) while \`/v1/\` stays compatible.`;

export const API_CONTRACT_SKILL_BODIES = [
  BREAKING_CHANGE_BODY,
  RESPONSE_SCHEMA_BODY,
  SEMVER_DISCIPLINE_BODY,
];

interface SeedSkillSpec {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

const CATALOG: SeedSkillSpec[] = [
  {
    name: 'pr-quality-rubric',
    description: 'Score the diff for correctness, tests, security, and defect-hiding clarity.',
    type: 'rubric',
    body: `# PR quality rubric
Score the diff against:
1. Correctness — would this break production?
2. Tests — are new branches asserted?
3. Security — secrets, injection, authz
4. Clarity — only if it hides a defect
Do not pad findings to move the score.`,
  },
  {
    name: 'no-then-chains',
    description: 'Flag new .then() / .catch() chains; prefer async/await.',
    type: 'convention',
    body: `# No .then() chains
Flag new JavaScript/TypeScript \`.then()\` / \`.catch()\` chains in application code.
Prefer async/await. Do not flag Promise.all, thenable test doubles, or generated files.`,
  },
  {
    name: 'secret-leakage-gate',
    description: 'Flag secrets, API keys, tokens, and connection strings in the diff.',
    type: 'security',
    body: `# Secret leakage gate
Flag secrets, API keys, tokens, private keys, and connection strings introduced in
the diff. Cite the exact line. Never echo the secret value in the finding.`,
  },
  {
    name: 'lethal-trifecta',
    description: 'Flag one agent flow that mixes untrusted input, private data, and exfil.',
    type: 'security',
    body: `# Lethal trifecta
Flag a single agent/LLM flow that combines (1) untrusted input, (2) private data
access, and (3) an exfiltration path. Name all three with file:line. Ordinary
authenticated APIs are not a trifecta.`,
  },
  {
    name: 'phantom-api-gate',
    description: 'Flag calls to APIs that are not declared or imported in the changed files.',
    type: 'security',
    body: `# Phantom API gate
Flag calls to APIs, methods, or routes that are not declared or imported in the
changed files.`,
  },
  {
    name: 'test-coverage-nudge',
    description: 'Nudge missing tests on production changes as a suggestion, not a blocker.',
    type: 'custom',
    body: `# Test coverage nudge
When production code changes and the diff adds no tests, note the gap as a
SUGGESTION, not a blocker.`,
  },
];

const TEST_QUALITY_SKILLS: SeedSkillSpec[] = [
  {
    name: 'uncovered-branches',
    description: 'Flag new production paths with no asserting test.',
    type: 'custom',
    body: UNCOVERED_BRANCHES_BODY,
  },
  {
    name: 'corner-cases',
    description: 'Flag missing empty, null, error, and boundary assertions.',
    type: 'custom',
    body: CORNER_CASES_BODY,
  },
  {
    name: 'excessive-mocking',
    description: 'Flag mocks that replace the unit under test or hide real behaviour.',
    type: 'custom',
    body: EXCESSIVE_MOCKING_BODY,
  },
];

const API_CONTRACT_SKILLS: SeedSkillSpec[] = [
  {
    name: 'breaking-change',
    description: 'Flag renamed or deleted public routes, methods, params, or JSON fields.',
    type: 'custom',
    body: BREAKING_CHANGE_BODY,
  },
  {
    name: 'response-schema',
    description: 'Flag public response shape drift: types, requiredness, nullability.',
    type: 'custom',
    body: RESPONSE_SCHEMA_BODY,
  },
  {
    name: 'semver-discipline',
    description: 'Flag a breaking contract change with no major version bump.',
    type: 'custom',
    body: SEMVER_DISCIPLINE_BODY,
  },
];

async function upsertSkill(db: Db, workspaceId: string, spec: SeedSkillSpec) {
  const [existing] = await db
    .select()
    .from(t.skills)
    .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, spec.name)));
  if (existing) return existing;
  return new SkillsRepository(db).insert({
    workspaceId,
    name: spec.name,
    description: spec.description,
    type: spec.type,
    source: 'manual',
    body: spec.body,
    enabled: true,
  });
}

async function agentIdByName(db: Db, workspaceId: string, name: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: t.agents.id })
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, name)));
  return row?.id;
}

/**
 * Idempotent mockup catalog + Test Quality + API Contract skill rows and links.
 * Does not insert \`flaky-tests\` or \`deprecation-policy\` — those arrive through import.
 */
export async function seedSkills(db: Db, workspaceId: string): Promise<void> {
  const byName = new Map<string, { id: string }>();
  for (const spec of [...CATALOG, ...TEST_QUALITY_SKILLS, ...API_CONTRACT_SKILLS]) {
    const row = await upsertSkill(db, workspaceId, spec);
    byName.set(spec.name, row);
  }

  const id = (name: string) => {
    const row = byName.get(name);
    if (!row) throw new Error(`seed skill missing: ${name}`);
    return row.id;
  };

  const agents = new AgentsRepository(db);
  const security = await agentIdByName(db, workspaceId, 'Security Reviewer');
  const performance = await agentIdByName(db, workspaceId, 'Performance Reviewer');
  const general = await agentIdByName(db, workspaceId, 'General Reviewer');
  const testQuality = await agentIdByName(db, workspaceId, 'Test Quality Reviewer');
  const apiContract = await agentIdByName(db, workspaceId, 'API Contract Reviewer');

  if (security) {
    await agents.setSkills(security, [
      { skillId: id('pr-quality-rubric'), enabled: true },
      { skillId: id('no-then-chains'), enabled: true },
      { skillId: id('secret-leakage-gate'), enabled: true },
      { skillId: id('lethal-trifecta'), enabled: true },
      { skillId: id('phantom-api-gate'), enabled: false },
      { skillId: id('test-coverage-nudge'), enabled: false },
    ]);
  }
  if (performance) {
    await agents.setSkills(performance, [{ skillId: id('pr-quality-rubric'), enabled: true }]);
  }
  if (general) await agents.setSkills(general, []);
  if (testQuality) {
    await agents.setSkills(testQuality, [
      { skillId: id('uncovered-branches'), enabled: true },
      { skillId: id('corner-cases'), enabled: true },
      { skillId: id('excessive-mocking'), enabled: true },
    ]);
  }
  if (apiContract) {
    await agents.setSkills(apiContract, [
      { skillId: id('breaking-change'), enabled: true },
      { skillId: id('response-schema'), enabled: true },
      { skillId: id('semver-discipline'), enabled: true },
    ]);
  }
}
