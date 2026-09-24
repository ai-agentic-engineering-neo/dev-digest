import type { Container } from '../../platform/container.js';
import { IntentService } from './application/intent-service.js';
import { GitDocSource } from './infrastructure/doc-source.js';
import { LlmIntentModel } from './infrastructure/llm-model.js';
import { IntentRepository } from './infrastructure/repository.js';
import { GitHubTicketSource } from './infrastructure/ticket-source.js';

/**
 * Composition root of the intent module (lazy: `Container.modules.intent`).
 * Other modules are reached only here: settings (feature model) and the
 * container's git/github adapters (doc/ticket sources). No background jobs —
 * derivation runs inline as reviews' shared pre-work (server/specs/
 * 05-intent-layer.md).
 */
export function buildIntentModule(c: Container) {
  const repository = new IntentRepository(c.db);
  const service = new IntentService({
    pulls: repository,
    store: repository,
    model: new LlmIntentModel({
      resolveModel: (workspaceId) => c.modules.settings.service.resolveFeatureModel(workspaceId, 'review_intent'),
      llm: (provider) => c.llm(provider),
    }),
    docs: new GitDocSource({
      git: { readFileAt: (repo, sha, path, opts) => c.git.readFileAt(repo, sha, path, opts) },
      github: () => c.github(),
    }),
    tickets: new GitHubTicketSource({ github: () => c.github() }),
    clock: () => new Date(),
    promptLog: c.promptLog,
  });
  return { service };
}
