import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Version of the running API, read from package.json at startup.
 *
 * Read from disk rather than `import`ed: package.json sits outside `rootDir`,
 * and importing it would push the compiled output down a `dist/server/src/…`
 * level. The path is the same from `src/platform/` (tsx) and `dist/platform/`
 * (built), so one relative lookup covers both.
 *
 * A missing/unreadable package.json is never fatal — liveness must answer even
 * if the file was dropped from a container image, so it degrades to 'unknown'.
 */
export const APP_VERSION = readVersion();

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, '..', '..', 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
