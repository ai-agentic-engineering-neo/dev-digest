import type { Container } from '../../platform/container.js';
import type { Intent, Provider, UnifiedDiff } from '@devdigest/shared';
import { Intent as IntentSchema } from '@devdigest/shared';
import { assemblePrompt } from '../../platform/prompt.js';
import { RunLogger } from '../../platform/run-logger.js';
import { NotFoundError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, PullRow } from './repository.js';
import { INTENT_MAX_RETRIES, INTENT_SYSTEM_PROMPT } from './constants.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { taskLine } from './helpers.js';

export async function deriveIntent(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  diff: UnifiedDiff,
  agent?: AgentRow,
  log?: RunLogger,
): Promise<Intent> {
  // An explicit agent provider/model wins; otherwise fall back to the workspace's
  // configured model for this feature (Settings → Feature Models), else the
  // registry default. Only hit the resolver when the agent doesn't fully specify.
  const agentProvider = agent?.provider as Provider | undefined;
  const agentModel = agent?.model ?? undefined;
  const fm =
    agentProvider && agentModel
      ? { provider: agentProvider, model: agentModel }
      : await resolveFeatureModel(container, workspaceId, 'review_intent');
  const provider = agentProvider ?? fm.provider;
  const model = agentModel ?? fm.model;
  const llm = await container.llm(provider);
  const { messages } = assemblePrompt({
    system: INTENT_SYSTEM_PROMPT,
    diff: diff.raw,
    task: taskLine(pull, undefined),
    // Feed the author's description so intent is read from what the PR claims,
    // not guessed from title + diff alone.
    ...(pull.body ? { prDescription: pull.body } : {}),
  });
  log?.tool(`Intent: requesting ${provider}/${model}`);
  const res = await llm.completeStructured<Intent>({
    model,
    schema: IntentSchema,
    schemaName: 'Intent',
    messages,
    maxRetries: INTENT_MAX_RETRIES,
  });
  // NOTE: intent is author-influenced (the LLM reads untrusted PR text), so we
  // do NOT trust it as a directive. It is rendered to the reviewer as an
  // <untrusted> block by `taskLine`, and the reviewer is told it can never
  // withhold a finding — so we persist it as-is without keyword scrubbing
  // (which would only ever catch one language anyway).
  log?.result(
    `Intent: ${res.data.in_scope?.length ?? 0} in-scope / ${res.data.out_of_scope?.length ?? 0} out-of-scope ` +
      `(${res.tokensIn}→${res.tokensOut} tokens)`,
  );
  await repo.upsertIntent(pull.id, res.data);
  return res.data;
}

export async function getIntent(
  repo: ReviewRepository,
  workspaceId: string,
  prId: string,
): Promise<Intent | undefined> {
  const pull = await repo.getPull(workspaceId, prId);
  if (!pull) throw new NotFoundError('Pull request not found');
  return repo.getIntent(prId);
}
