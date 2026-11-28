import { buildApp } from './app.js';
import { loadConfig } from './platform/config.js';

/** Production/dev entrypoint. `pnpm dev` runs `tsx watch src/server.ts`. */
async function main() {
  const config = loadConfig();
  const app = await buildApp({ config });

  // Last-resort net: a stray rejection must be visible but must not take the
  // API (and every in-flight review) down. Deliberately does not exit.
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'unhandled promise rejection');
  });

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

  // Reap runs left 'running' by a previous (now-dead) process — otherwise they
  // show as perpetually "running" in the UI and can't be cancelled (no runner).
  // Lives here, not in buildApp, so tests that build the app never query the
  // database. AWAITED before listen: a fresh process has no in-flight runs of
  // its own (runs only start via POST /review once listening), so every
  // 'running' row is genuinely orphaned, and a brand-new run cannot be reaped.
  // NOTE: assumes a SINGLE API instance per DB; replicas would need
  // per-instance scoping / heartbeats.
  try {
    const reaped = await app.container.reviewRepo.reapStaleRunningRuns();
    if (reaped > 0) app.log.info({ reaped }, 'reaped stale running agent_runs on boot');
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'stale-run reaping failed (non-fatal)');
  }

  // Same reasoning for background jobs: the queue is in memory, so a job left
  // 'queued'/'running' by the previous process will never run.
  try {
    const reaped = await app.container.jobs.reapStaleJobs();
    if (reaped > 0) app.log.info({ reaped }, 'reaped stale queued/running jobs on boot');
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'stale-job reaping failed (non-fatal)');
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
