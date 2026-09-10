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

/** One reviewer installed in the target repository, with the skills it
 *  resolves. Several may share one bundle: the runner reviews every manifest
 *  it finds under `.devdigest/agents/` in a single job. */
export interface BundleAgent {
  /** `skillSlugs` is derived from `skills` below, never taken from here. */
  agent: Omit<ManifestSourceAgent, 'skillSlugs'>;
  skills: BundleSkill[];
}

export interface BuildBundleInput {
  target: CiTarget;
  /** At least one; rendered in the caller's order, which the service fixes
   *  to a stable one (installation order). */
  agents: BundleAgent[];
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
 * the lazily-`import()`ed numbered chunk, and `package.json`) and copy
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

/** Assemble the whole bundle for one target — workflow, one manifest per
 *  installed agent, one file per skill across all of them, the ENTIRE
 *  runner-bundle directory (P-2, not a single file), and the memory export.
 *  Byte-identical output for an unchanged installation (AC-9) — nothing here
 *  reads a clock or randomness, and every list is sorted before it is
 *  emitted. */
export function buildBundle(input: BuildBundleInput): CiFile[] {
  const generator: CiTargetGenerator | undefined = getTargetGenerator(input.target);
  if (!generator) {
    throw new ValidationError(`No generator registered for CI target "${input.target}"`);
  }

  const readFile = input.readFile ?? ((p: string) => readFileSync(p, 'utf8'));
  const listDir = input.listRunnerBundleFiles ?? defaultListDir;

  if (input.agents.length === 0) {
    throw new ValidationError('A CI bundle needs at least one agent');
  }

  const workflowYaml = generator.buildWorkflow({ triggers: input.triggers, postAs: input.postAs });

  // One manifest per agent. Two agents cannot land on the same path —
  // `agentSlug` disambiguates by agent id — but assert it rather than trust
  // it: a collision would silently drop a reviewer the user believes is
  // installed, which is exactly the failure this feature must not have.
  const manifestFiles = input.agents.map((a) =>
    agentManifestFile({ ...a.agent, skillSlugs: a.skills.map((s) => s.slug) }),
  );
  const manifestPaths = new Set(manifestFiles.map((m) => m.path));
  if (manifestPaths.size !== manifestFiles.length) {
    throw new ValidationError('Two agents generated the same manifest path; refusing to emit a bundle that would drop one');
  }

  // The UNION of every agent's skills, deduplicated by slug — a skill is one
  // row per workspace, so two agents referencing it must not produce two
  // copies of the same file (and never two DIFFERENT bodies at one path).
  const skillsBySlug = new Map<string, BundleSkill>();
  for (const a of input.agents) {
    for (const skill of a.skills) skillsBySlug.set(skill.slug, skill);
  }
  const skillFiles = [...skillsBySlug.values()]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((s) => toCiFile(skillFilePath(s.slug), s.body, true));

  const runnerFiles = readRunnerBundleDir(input.runnerBundleDir, listDir, readFile);
  const memoryJsonl = buildMemoryJsonl(input.memory);

  const files: CiFile[] = [
    toCiFile(generator.workflowPath, workflowYaml, true),
    // Sorted by path so the bundle's file order never depends on the order
    // agents were added to the installation (AC-9).
    ...[...manifestFiles]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((m) => toCiFile(m.path, m.contents, true)),
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

/**
 * P-4 — shapes a generated bundle into a PREVIEW response: the runner
 * bundle's own files (path under `RUNNER_DIR/`) get `contents: null`,
 * keeping `bytes`/`sha256`; every other file keeps its full generated
 * contents. `buildBundle` itself never does this (see its own comment
 * above) — a literal reading of AC-3 would otherwise push the ~1.6 MB
 * minified runner bundle into the browser on every Configure-step change
 * (AC-4c regenerates the preview on every toggle). The export/archive paths
 * call `buildBundle` directly and never pass through this function, so
 * every file that is actually committed or zipped always carries real
 * contents.
 */
export function toPreviewFiles(files: CiFile[]): CiFile[] {
  return files.map((f) => (f.path.startsWith(`${RUNNER_DIR}/`) ? { ...f, contents: null } : f));
}
