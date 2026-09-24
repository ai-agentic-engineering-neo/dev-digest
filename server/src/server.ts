import closeWithGrace from 'close-with-grace';
import { buildApp } from './app.js';
import { loadConfig } from './platform/config.js';

/**
 * Production/dev entrypoint. `pnpm dev` runs `tsx watch src/server.ts`.
 *
 * Shutdown (SIGTERM/SIGINT, uncaught exception, unhandled rejection) goes
 * through close-with-grace → `app.close()`, which runs the preClose hook
 * (cancel live review runs, stop the JobRunner, end SSE streams — see
 * Container.shutdown) and then the onClose hooks (close the postgres pool).
 * If that takes longer than GRACE_MS, or a second signal arrives, the process
 * exits with code 1.
 */
const GRACE_MS = 20_000; // > Container.shutdown's bounded waits (5s runs ‖ 10s jobs) + pool close

async function main() {
  const config = loadConfig();
  const app = await buildApp({ config });

  // Log every unhandled rejection with its stack; close-with-grace then shuts
  // the server down gracefully instead of Node crashing mid-request.
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'unhandledRejection');
  });

  closeWithGrace({ delay: GRACE_MS }, async ({ signal, err }) => {
    if (err) app.log.error({ err }, 'fatal error — shutting down');
    else app.log.info({ signal }, 'shutdown signal received — closing');
    await app.close();
  });

  await app.listen({ port: config.apiPort, host: config.apiHost });
  app.log.info(`DevDigest API listening on http://${config.apiHost}:${config.apiPort}`);
  if (config.llmProviderOverride === 'mock') {
    app.log.warn(
      { llmProviderOverride: 'mock', llmMockDelayMs: config.llmMockDelayMs ?? 0 },
      '!!! LLM_PROVIDER_OVERRIDE=mock — EVERY LLM provider is the deterministic MOCK (adapters/llm/mock.ts). ' +
        'Reviews are fake fixtures, no model is called. Dev/e2e only — unset it for real reviews. !!!',
    );
  }
}

main().catch((err) => {
  // The app (and its logger) may not exist yet — config/DB/listen failed.
  console.error('DevDigest API failed to start:', err);
  process.exit(1);
});
