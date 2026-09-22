import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import { sql } from 'drizzle-orm';
import { loadConfig, type AppConfig } from './platform/config.js';
import { loggerOptions } from './platform/logging.js';
import { createDb, type Db } from './db/client.js';
import { Container, type ContainerOverrides } from './platform/container.js';
import { registerErrorHandling } from './http/error-handler.js';
import { modules } from './modules/index.js';

// Attach the DI container to every request/instance.
declare module 'fastify' {
  interface FastifyInstance {
    container: Container;
  }
}

export interface BuildAppOptions {
  config?: AppConfig;
  db?: Db;
  overrides?: ContainerOverrides;
}

/**
 * buildApp() — exported so tests can use `app.inject()` without a real port.
 * Wires the zod type provider (request validation + response serialization),
 * the security/transport plugins (helmet, cors, rate-limit, SSE) ahead of the
 * DI container and the statically-registered feature modules, plus a structured
 * error handler returning the ApiErrorBody envelope.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadConfig();
  const handle = opts.db ? null : createDb(config.databaseUrl);
  const db = opts.db ?? handle!.db;

  const app = Fastify({
    // Explicit 1MB cap on request bodies (PR comments, settings payloads are
    // small). Protects against oversized/abusive payloads.
    bodyLimit: 1_048_576,
    logger: loggerOptions(config),
  });

  // Use zod schemas directly for request validation + response serialization.
  // Routes opt in per-module via `app.withTypeProvider<ZodTypeProvider>()`.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const container = new Container(config, db, opts.overrides, app.log);
  app.decorate('container', container);
  // Every module's job handlers (declared in modules/<name>/composition.ts).
  container.registerJobHandlers();

  // Reap runs left 'running' by a previous (now-dead) process — otherwise they
  // show as perpetually "running" in the UI and can't be cancelled (no runner).
  //
  // AWAITED before the server accepts requests: a fresh process has no in-flight
  // runs of its own yet (runs only start via POST /review once listening), so
  // every 'running' row here is genuinely orphaned. Awaiting also closes the
  // race where a brand-new run could be created (and wrongly reaped) in the gap
  // between listening and an async reaper finishing.
  // NOTE: assumes a SINGLE API instance per DB. With multiple replicas this
  // would need per-instance scoping / heartbeats (not this app's deployment).
  try {
    const reaped = await container.modules.reviews.service.reapStaleRuns();
    if (reaped > 0) app.log.info({ reaped }, 'reaped stale running agent_runs on boot');
  } catch (err) {
    app.log.warn({ err }, 'stale-run reaping failed (non-fatal)');
  }

  // Security headers (X-Content-Type-Options, X-Frame-Options, …). The API
  // serves JSON only, so the default CSP is fine.
  await app.register(helmet);
  await app.register(cors, { origin: [config.webOrigin], credentials: true });
  await app.register(FastifySSEPlugin);

  // Global rate limit. Disabled under test so integration suites can hammer
  // endpoints via inject(); per-route overrides live on the routes themselves.
  if (config.nodeEnv !== 'test') {
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  }

  // Liveness check (no module, no DB, no rate limit).
  app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

  // Readiness check — verifies the DB is reachable with a cheap `SELECT 1`.
  // 503 (not 500) so orchestrators treat it as "not ready yet", not a crash.
  app.get('/health/ready', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ready: true };
    } catch (err) {
      app.log.warn({ err }, 'readiness check failed: db unreachable');
      return reply.status(503).send({ ready: false });
    }
  });

  // Root error + 404 handlers (envelope + the one kind → status table live in
  // src/http/error-handler.ts). Registered BEFORE modules so encapsulated
  // module plugins inherit them.
  registerErrorHandling(app);

  // Register feature modules from the static registry (src/modules/index.ts).
  // Each module is a Fastify plugin in modules/<name>/routes.ts.
  for (const plugin of Object.values(modules)) {
    await app.register(plugin);
  }

  // Graceful shutdown, part 1 (preClose = before the HTTP server stops
  // accepting/draining): cancel live review runs, stop the JobRunner, end SSE
  // streams — an open SSE connection would otherwise stall app.close().
  app.addHook('preClose', async () => {
    const res = await container.shutdown();
    if (res.cancelledRuns.length > 0 || !res.runsDrained || !res.jobsDrained) {
      app.log.warn(res, 'shutdown: in-flight work cancelled');
    }
  });
  // Part 2: close the db handle we created (after runs/jobs wrote their final state).
  if (handle) app.addHook('onClose', async () => handle.close());

  return app;
}
