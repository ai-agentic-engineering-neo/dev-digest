import type { Container } from '../../platform/container.js';
import type { Provider } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import type { AgentRow, EvalCaseRow, SkillRow } from '../../db/rows.js';
import { resolveEnabledSkills } from '../agents/helpers.js';
import { HARNESS_MODEL, HARNESS_PROVIDER, HARNESS_SYSTEM_PROMPT } from './constants.js';
import { gradeEvalCase, type FindingDescriptor, type GradingResult } from './grading.js';

export interface EvalRunOutcome {
  actualOutput: FindingDescriptor[];
  metrics: GradingResult;
}

interface ReviewConfig {
  systemPrompt: string;
  model: string;
  provider: Provider;
  skills: string[];
}

/**
 * Shared execute+grade glue: parse the case's diff, run it through the given
 * reviewer config (the same `reviewPullRequest` call `run-executor.ts` makes
 * for a real PR review — no separate eval engine), grade the grounded
 * findings against `expected_output`. Used by both `runEvalCase` (agent) and
 * `runSkillEvalCase` (isolated harness) so neither duplicates this logic.
 */
async function executeAndGrade(
  container: Container,
  config: ReviewConfig,
  evalCase: EvalCaseRow,
): Promise<EvalRunOutcome> {
  const start = Date.now();
  const llm = await container.llm(config.provider);
  const diff = parseUnifiedDiff(evalCase.inputDiff ?? '');

  const outcome = await reviewPullRequest({
    systemPrompt: config.systemPrompt,
    model: config.model,
    diff,
    llm,
    ...(config.skills.length > 0 ? { skills: config.skills } : {}),
    task: `Eval case: ${evalCase.name}`,
  });
  const durationMs = Date.now() - start;

  const actualOutput: FindingDescriptor[] = outcome.review.findings.map((f) => ({
    severity: f.severity,
    category: f.category,
  }));
  const expected = (
    Array.isArray(evalCase.expectedOutput) ? evalCase.expectedOutput : []
  ) as FindingDescriptor[];

  const metrics = gradeEvalCase(
    expected,
    actualOutput,
    { kept: outcome.review.findings.length, dropped: outcome.dropped.length },
    durationMs,
    outcome.costUsd,
  );

  return { actualOutput, metrics };
}

/** Run one eval case owned by an AGENT: the agent's real provider/model/
 *  system prompt/enabled skills. */
export async function runEvalCase(
  container: Container,
  agent: AgentRow,
  evalCase: EvalCaseRow,
): Promise<EvalRunOutcome> {
  const skills = await resolveEnabledSkills(container.agentsRepo, agent.id);
  return executeAndGrade(
    container,
    {
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      provider: agent.provider as Provider,
      skills: skills.map((s) => s.body),
    },
    evalCase,
  );
}

/** Run one eval case owned by a SKILL: the isolated test harness — a fixed
 *  generic reviewer with ONLY this skill's body injected. */
export async function runSkillEvalCase(
  container: Container,
  skill: SkillRow,
  evalCase: EvalCaseRow,
): Promise<EvalRunOutcome> {
  return executeAndGrade(
    container,
    {
      systemPrompt: HARNESS_SYSTEM_PROMPT,
      model: HARNESS_MODEL,
      provider: HARNESS_PROVIDER,
      skills: [skill.body],
    },
    evalCase,
  );
}
