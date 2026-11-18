import { buildApp } from './app.js';
import { loadConfig } from './platform/config.js';

/** Production/dev entrypoint. `pnpm dev` runs `tsx watch src/server.ts`. */
async function main() {
  const config = loadConfig();
  const app = await buildApp({ config });

  // specs/12-eval-pipeline.md D19 — reconcile any eval run left `running` by
  // a previous (now-dead) process, mirroring `app.ts`'s `agent_runs` reaper
  // for the same failure mode. Best-effort: a DB hiccup here must never
  // block boot.
  try {
    const reconciled = await app.container.evalService.reconcileStaleRuns();
    if (reconciled > 0) app.log.info({ reconciled }, 'reconciled stale running eval_runs on boot');
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'eval stale-run reconciliation failed (non-fatal)');
  }

  // Graceful shutdown: on SIGTERM/SIGINT close the server, which runs the
  // onClose hooks (drains in-flight requests/SSE, closes the postgres pool).
  // Guarded so a second signal during shutdown doesn't double-close.
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, async () => {
      if (closing) return;
      closing = true;
      app.log.info(`${signal} received — shutting down`);
      try {
        await app.close();
        process.exit(0);
      } catch (err) {
        app.log.error(err, 'error during shutdown');
        process.exit(1);
      }
    });
  }

  try {
    await app.listen({ port: config.apiPort, host: config.apiHost });
    app.log.info(`DevDigest API listening on http://${config.apiHost}:${config.apiPort}`);
    if (config.apiHost !== '127.0.0.1' && config.apiHost !== 'localhost' && config.apiHost !== '::1') {
      app.log.warn(
        `API_HOST=${config.apiHost} — the API has no authentication and is now reachable beyond this machine`,
      );
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
