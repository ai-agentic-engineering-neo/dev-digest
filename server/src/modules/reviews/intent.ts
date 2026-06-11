import type { Container } from '../../platform/container.js';
import type { Intent, Provider, UnifiedDiff } from '@devdigest/shared';
import { Intent as IntentSchema } from '@devdigest/shared';
import { assemblePrompt } from '../../platform/prompt.js';
import { RunLogger } from '../../platform/run-logger.js';
import { NotFoundError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, PullRow } from './repository.js';
import { DEFAULT_INTENT_MODEL, DEFAULT_INTENT_PROVIDER, INTENT_MAX_RETRIES, INTENT_SYSTEM_PROMPT } from './constants.js';
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
  const provider = (agent?.provider as Provider) ?? DEFAULT_INTENT_PROVIDER;
  const model = agent?.model ?? DEFAULT_INTENT_MODEL;
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
