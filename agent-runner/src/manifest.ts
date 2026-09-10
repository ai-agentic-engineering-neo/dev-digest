import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { RunnerError } from './errors.js';

/**
 * Loads and VALIDATES the checked-in `.devdigest/agents/<slug>.yaml` manifests
 * (AC-20) — one per reviewer installed in the repository. Each manifest is
 * written by the studio's export flow
 * (`server/src/modules/ci/manifest.ts`) and is otherwise untrusted on-disk
 * content by the time it reaches CI — it is schema-validated with the same
 * `AgentManifest` Zod contract before any of its fields (system prompt, model,
 * ci_fail_on) are used to build a review. Fail clearly (a descriptive
 * `RunnerError`) rather than silently defaulting or partially trusting it.
 */

export type { AgentManifest } from '@devdigest/shared';

export interface FsDeps {
  readFile?: typeof readFileSync;
  readDir?: typeof readdirSync;
}

/**
 * Every agent manifest under `<devdigestDir>/agents/`, in a STABLE sorted
 * order — the order agents are reviewed in and rendered in, which must not
 * depend on the filesystem's directory-listing order.
 *
 * A repository may install several reviewers into one workflow (one job, one
 * posted review). Zero manifests is still an error; more than one is not.
 */
export function findManifestPaths(devdigestDir: string, deps: FsDeps = {}): string[] {
  const readDir = deps.readDir ?? readdirSync;
  const agentsDir = path.join(devdigestDir, 'agents');
  let entries: string[];
  try {
    entries = readDir(agentsDir) as unknown as string[];
  } catch (err) {
    throw new RunnerError(
      `Agent manifest directory not found: ${agentsDir} (${(err as Error).message})`,
    );
  }
  const yamlFiles = entries.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
  if (yamlFiles.length === 0) {
    throw new RunnerError(`No agent manifest (*.yaml) found in ${agentsDir}`);
  }
  return yamlFiles.map((f) => path.join(agentsDir, f));
}

/** The first agent manifest file. Kept for callers that genuinely want one
 *  (and for the single-agent case); prefer `findManifestPaths`. */
export function findManifestPath(devdigestDir: string, deps: FsDeps = {}): string {
  return findManifestPaths(devdigestDir, deps)[0]!;
}

/** Read, parse, and Zod-validate the manifest at `manifestPath` (AC-20). */
export function loadAgentManifest(manifestPath: string, deps: FsDeps = {}): AgentManifest {
  const readFile = deps.readFile ?? readFileSync;
  let raw: string;
  try {
    raw = readFile(manifestPath, 'utf8') as unknown as string;
  } catch (err) {
    throw new RunnerError(
      `Cannot read agent manifest at ${manifestPath}: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new RunnerError(
      `Agent manifest at ${manifestPath} is not valid YAML: ${(err as Error).message}`,
    );
  }

  const result = AgentManifest.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new RunnerError(`Agent manifest at ${manifestPath} failed validation: ${issues}`);
  }
  return result.data;
}

/** Convenience: locate + load + validate the FIRST manifest. */
export function loadManifest(devdigestDir: string, deps: FsDeps = {}): AgentManifest {
  return loadManifests(devdigestDir, deps)[0]!;
}

/**
 * Locate + load + validate EVERY manifest, in `findManifestPaths` order.
 *
 * Fails on the first invalid manifest rather than reviewing with the agents
 * that happened to parse: a partial review posted under the roster's name
 * would look like a complete one.
 */
export function loadManifests(devdigestDir: string, deps: FsDeps = {}): AgentManifest[] {
  return findManifestPaths(devdigestDir, deps).map((p) => loadAgentManifest(p, deps));
}
