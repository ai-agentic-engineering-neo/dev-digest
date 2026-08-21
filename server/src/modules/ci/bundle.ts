import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CiFile } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { MEMORY_PATH, RUNNER_DIR, skillFilePath } from './constants.js';
import { agentManifestFile, type ManifestSourceAgent } from './manifest.js';
import { buildMemoryJsonl, type MemoryExportRow } from './memory-export.js';
import { getTargetGenerator, type CiTargetGenerator } from './targets.js';
import { containsKnownSecretValue, containsSecretShapedValue } from './redact.js';
import type { PostAsMode } from './workflow.js';
import type { CiTarget } from '@devdigest/shared';

/**
 * specs/14-export-to-ci.md (P2, security-critical) — assembles the whole
 * generated bundle. Pure and deterministic: no DB, no HTTP, no LLM
 * (AC-9/AC-25). The only I/O is reading the already-built runner bundle off
 * disk, which is injectable for tests.
 */

export interface BundleSkill {
  /** A skill's own `name` column — already slug-shaped (SKILL_NAME_RE). */
  slug: string;
  body: string;
}

export interface BuildBundleInput {
  target: CiTarget;
  /** `skillSlugs` is derived from `skills` below, never taken from here. */
  agent: Omit<ManifestSourceAgent, 'skillSlugs'>;
  skills: BundleSkill[];
  memory: MemoryExportRow[];
  triggers: readonly string[];
  postAs: PostAsMode;
  /** Absolute path to the pulled-in agent-runner's committed bundle
   *  DIRECTORY (`agent-runner/dist` — `AppConfig.ciRunnerBundleDir`). Every
   *  file in it ships under `.devdigest/runner/` (P-2) — copied wholesale,
   *  never an enumerated allow-list. */
  runnerBundleDir: string;
  /** Injectable for tests; defaults to a real `fs.readdirSync` (files only,
   *  non-recursive — the real `agent-runner/dist` output is flat). */
  listRunnerBundleFiles?: (dir: string) => string[];
  /** Injectable for tests; defaults to a real fs read. */
  readFile?: (path: string) => string;
  /** Known secret VALUES to scan generated contents against, in addition to
   *  the shape-based check (AC-15/AC-55). Optional — callers that don't have
   *  a resolved secret value on hand may omit it. */
  knownSecretValues?: readonly (string | undefined)[];
}

function sha256Hex(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

/** Every `CiFile` carries its own `bytes`/`sha256` (P-4) — computed once,
 *  here, so no caller can construct one of these without them. */
function toCiFile(path: string, contents: string, editable: boolean): CiFile {
  return {
    path,
    contents,
    bytes: Buffer.byteLength(contents, 'utf8'),
    sha256: sha256Hex(contents),
    editable,
  };
}

function defaultListDir(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

/**
 * P-2 — read agent-runner's ENTIRE built bundle directory (today: `index.js`,
 * the lazily-`import()`ed `310.index.js` chunk, and `package.json`) and copy
 * every file under `.devdigest/runner/` wholesale. AC-14's "the path the
 * workflow executes exists in the bundle" is necessary but not sufficient —
 * every file `agent-runner/dist/` actually contains must be present, or the
 * bundle's lazy `import()` (or its ESM resolution via `package.json`) breaks
 * the first time it's exercised in a target repo.
 */
function readRunnerBundleDir(
  dir: string,
  listDir: (d: string) => string[],
  readFile: (p: string) => string,
): CiFile[] {
  let names: string[];
  try {
    names = listDir(dir);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    // AC-52 — a stated PRECONDITION error naming the directory and the build
    // command, never a bare runtime crash. `ValidationError`, not
    // `ConfigError` — this is a client-actionable "run the build" condition
    // (server/LEARNINGS.md: `ConfigError` responds 500 even when the fix is
    // "do X", which is wrong for this case).
    throw new ValidationError(
      `agent-runner bundle not found at ${dir}. Run \`pnpm --dir agent-runner build\` ` +
        `to produce it before exporting to CI (${cause}).`,
    );
  }
  if (names.length === 0) {
    throw new ValidationError(
      `agent-runner bundle at ${dir} is empty. Run \`pnpm --dir agent-runner build\` ` +
        `to produce it before exporting to CI.`,
    );
  }
  // Stable, deterministic order (AC-9) — never directory-listing order,
  // which is not guaranteed stable across filesystems/runs.
  return [...names].sort().map((name) => {
    const contents = readFile(join(dir, name));
    // A build artifact, never hand-edited.
    return toCiFile(`${RUNNER_DIR}/${name}`, contents, false);
  });
}

/** Assemble the whole bundle for one target — workflow, manifest, one file
 *  per skill, the ENTIRE runner-bundle directory (P-2, not a single file),
 *  and the memory export. Byte-identical output for an unchanged agent
 *  (AC-9) — nothing here reads a clock or randomness. */
export function buildBundle(input: BuildBundleInput): CiFile[] {
  const generator: CiTargetGenerator | undefined = getTargetGenerator(input.target);
  if (!generator) {
    throw new ValidationError(`No generator registered for CI target "${input.target}"`);
  }

  const readFile = input.readFile ?? ((p: string) => readFileSync(p, 'utf8'));
  const listDir = input.listRunnerBundleFiles ?? defaultListDir;

  const workflowYaml = generator.buildWorkflow({ triggers: input.triggers, postAs: input.postAs });
  const manifest = agentManifestFile({
    ...input.agent,
    skillSlugs: input.skills.map((s) => s.slug),
  });
  const skillFiles = [...input.skills]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((s) => toCiFile(skillFilePath(s.slug), s.body, true));
  const runnerFiles = readRunnerBundleDir(input.runnerBundleDir, listDir, readFile);
  const memoryJsonl = buildMemoryJsonl(input.memory);

  const files: CiFile[] = [
    toCiFile(generator.workflowPath, workflowYaml, true),
    toCiFile(manifest.path, manifest.contents, true),
    ...skillFiles,
    // P-2 — the whole runner-bundle directory, not one enumerated file.
    ...runnerFiles,
    toCiFile(MEMORY_PATH, memoryJsonl, true),
  ];

  // AC-15/AC-55, defence in depth — assert every generated file's contents
  // are clean BEFORE they are ever returned to a caller, offered in a
  // preview, or committed. A hit here is an internal-invariant failure (this
  // module never accepts a raw secret value as an input in the first
  // place), so it throws rather than silently redacting.
  for (const file of files) {
    // `buildBundle` never nulls a file's own `contents` — the nullable case
    // in the shared `CiFile` type is a PREVIEW-response shaping concern
    // (P-4), applied downstream of this function, never here.
    const contents = file.contents ?? '';
    if (containsSecretShapedValue(contents)) {
      throw new ValidationError(
        `Generated file ${file.path} contains a credential-shaped value; refusing to emit it`,
      );
    }
    if (containsKnownSecretValue(contents, input.knownSecretValues ?? [])) {
      throw new ValidationError(
        `Generated file ${file.path} contains a known secret value; refusing to emit it`,
      );
    }
  }

  return files;
}
