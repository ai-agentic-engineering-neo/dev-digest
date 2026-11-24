import type { FastifyPluginAsync } from 'fastify';
import settings from './settings/index.js';
import repos from './repos/index.js';
import pulls from './pulls/index.js';
import polling from './polling/index.js';
import workspace from './workspace/index.js';
import agents from './agents/index.js';
import reviews from './reviews/index.js';
import repoIntel from './repo-intel/index.js';

/**
 * Module registry. Each feature module is a Fastify plugin — legacy modules
 * export it from `modules/<name>/routes.ts`, migrated (onion) modules from
 * `modules/<name>/index.ts`. Registered here in one place.
 *
 * ADD A MODULE: create `modules/<name>/routes.ts` exporting a default Fastify
 * plugin, then add one import + one entry below. (We register statically rather
 * than via filesystem autoload so the same code path works under tsx, the
 * bundler, and vitest — native dynamic import() of .ts files is not portable.)
 *
 * This is the starter set. Each later milestone adds its own module here
 * (skills, intent/smart-diff, blast, brief/context/onboarding, eval/ci/hooks,
 * memory, plugins, …) without touching any other module or the shared schema.
 */
export const modules: Record<string, FastifyPluginAsync> = {
  settings,
  repos,
  pulls,
  polling,
  workspace,
  agents,
  reviews,
  repoIntel,
};
