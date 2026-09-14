import { readFile, stat } from 'node:fs/promises';
import { ContainmentError, MissingPathError, resolveContainedPath } from '../_shared/checkout-paths.js';
import { LOCKFILE_NAMES, MAX_MANIFEST_BYTES } from './constants.js';

/**
 * AC-2: deterministic stack detection from the repository's synced checkout.
 * Every read is containment-checked (`resolveContainedPath`) and size-capped
 * (`MAX_MANIFEST_BYTES`) before it happens — SPEC-09's "Security — path
 * containment" precedent. `package.json` is the only file this module parses
 * as JSON; lockfiles are detected by FILENAME only (`stat`), never read.
 *
 * Every returned value carries `{ value, evidenceFile }` (AC-2's "report each
 * detected value together with the file that evidenced it").
 */

export interface EvidenceValue {
  value: string;
  evidenceFile: string;
}

export interface StackFacts {
  language?: EvidenceValue;
  runtime?: EvidenceValue;
  packageManager?: EvidenceValue;
  frameworks: EvidenceValue[];
}

/** Small fixed table: dependency name → display label. Deliberately not
 *  exhaustive — AC-2 asks for DECLARED framework dependencies, not a full
 *  ecosystem survey (N10 — TS/JS stacks only). */
const FRAMEWORK_TABLE: Readonly<Record<string, string>> = {
  next: 'Next.js',
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  '@angular/core': 'Angular',
  fastify: 'Fastify',
  express: 'Express',
  koa: 'Koa',
  '@nestjs/core': 'NestJS',
  vite: 'Vite',
  'drizzle-orm': 'Drizzle ORM',
  prisma: 'Prisma',
  typeorm: 'TypeORM',
  sequelize: 'Sequelize',
};

interface PackageJsonShape {
  engines?: Record<string, string>;
  packageManager?: string;
  type?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function emptyStackFacts(): StackFacts {
  return { frameworks: [] };
}

/**
 * `clonePath` must be a real, containment-checkable checkout root. Returns
 * `emptyStackFacts()` (never throws) when the checkout has no readable
 * `package.json` — N10's "a repo the indexer cannot parse gets the skeleton
 * and an honest reason" applies at the caller, not here.
 */
export async function detectStack(clonePath: string): Promise<StackFacts> {
  const pkg = await readManifest(clonePath);
  if (!pkg) return emptyStackFacts();

  const facts: StackFacts = { frameworks: [] };

  const nodeEngine = pkg.engines?.node;
  if (nodeEngine) {
    facts.runtime = { value: `node ${nodeEngine}`, evidenceFile: 'package.json' };
  }

  // Language: TypeScript iff a root tsconfig.json exists (existence check
  // only — never read). Falls back to JavaScript once a package.json exists
  // at all.
  const hasTsconfig = await fileExists(clonePath, 'tsconfig.json');
  facts.language = hasTsconfig
    ? { value: 'TypeScript', evidenceFile: 'tsconfig.json' }
    : { value: 'JavaScript', evidenceFile: 'package.json' };

  facts.packageManager = await detectPackageManager(clonePath, pkg);

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, label] of Object.entries(FRAMEWORK_TABLE)) {
    if (deps[name]) facts.frameworks.push({ value: label, evidenceFile: 'package.json' });
  }

  return facts;
}

async function detectPackageManager(
  clonePath: string,
  pkg: PackageJsonShape,
): Promise<EvidenceValue | undefined> {
  // `"packageManager": "pnpm@9.1.0"` — declared, so it wins over a lockfile
  // guess.
  if (pkg.packageManager) {
    const name = pkg.packageManager.split('@')[0];
    if (name) return { value: name, evidenceFile: 'package.json' };
  }
  for (const [filename, name] of Object.entries(LOCKFILE_NAMES)) {
    if (await fileExists(clonePath, filename)) {
      return { value: name, evidenceFile: filename };
    }
  }
  return undefined;
}

/** Containment-checked, size-capped `package.json` read + JSON parse. `null`
 *  on any failure (missing, escapes containment, too large, invalid JSON) —
 *  never throws, so a malformed manifest degrades stack detection instead of
 *  failing the whole fact assembly. */
async function readManifest(clonePath: string): Promise<PackageJsonShape | null> {
  const raw = await readCheckoutFile(clonePath, 'package.json');
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as PackageJsonShape) : null;
  } catch {
    return null;
  }
}

/** Containment-checked, size-capped read of a root-level checkout file.
 *  `null` when missing, escapes containment, unreadable, or over the byte
 *  cap — never throws. Exported for `setup.ts` to reuse for the compose /
 *  env-example reads. */
export async function readCheckoutFile(clonePath: string, name: string): Promise<string | null> {
  let resolved: string;
  try {
    resolved = await resolveContainedPath(clonePath, name);
  } catch (err) {
    if (err instanceof ContainmentError || err instanceof MissingPathError) return null;
    return null; // unreadable (permissions, etc.) — degrade, never throw
  }
  let st;
  try {
    st = await stat(resolved);
  } catch {
    return null;
  }
  if (!st.isFile() || st.size > MAX_MANIFEST_BYTES) return null;
  try {
    return await readFile(resolved, 'utf8');
  } catch {
    return null;
  }
}

/** Containment-checked existence check (stat only, never a read). */
export async function fileExists(clonePath: string, name: string): Promise<boolean> {
  let resolved: string;
  try {
    resolved = await resolveContainedPath(clonePath, name);
  } catch {
    return false;
  }
  try {
    const st = await stat(resolved);
    return st.isFile();
  } catch {
    return false;
  }
}
