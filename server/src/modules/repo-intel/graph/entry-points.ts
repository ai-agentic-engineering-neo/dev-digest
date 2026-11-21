/**
 * Entry-point and test classification of a file (AC-27a). Pure.
 *
 *   - entry point: the file has `file_facts` endpoints / crons, or is a Next.js
 *     app-router `app/**\/{page,route,layout}.*` file;
 *   - test: `*.test.*`, `*.spec.*`, or anything under `__tests__/`.
 *
 * Tests win over entry points (a `route.test.ts` is a test, not a route).
 */

export type EntryType = 'endpoint' | 'cron' | 'page' | 'route' | 'layout';

export interface FileFactsLite {
  endpoints: readonly string[];
  crons: readonly string[];
}

export interface EntryClass {
  type: EntryType;
  /** `GET /users`, `cron 0 * * * *`, `page app/x/page.tsx`… */
  label: string;
}

const TEST_FILE = /(^|\/)[^/]+\.(test|spec)\.[^/]+$/;
const TESTS_DIR = /(^|\/)__tests__\//;
const APP_ROUTER = /(^|\/)app\/(?:.*\/)?(page|route|layout)\.[A-Za-z0-9]+$/;

export function isTestFile(path: string): boolean {
  return TEST_FILE.test(path) || TESTS_DIR.test(path);
}

export function classifyEntryPoint(path: string, facts?: FileFactsLite | null): EntryClass | null {
  if (isTestFile(path)) return null;
  const endpoint = facts?.endpoints[0];
  if (endpoint) return { type: 'endpoint', label: endpoint };
  const cron = facts?.crons[0];
  if (cron) return { type: 'cron', label: `cron ${cron}` };
  const m = APP_ROUTER.exec(path);
  if (m) return { type: m[2] as 'page' | 'route' | 'layout', label: `${m[2]} ${path}` };
  return null;
}
