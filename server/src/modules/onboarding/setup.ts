import { FACT_SCRIPTS_MAX, MAX_SCRIPT_CHARS } from './constants.js';
import { fileExists, readCheckoutFile } from './stack.js';

/**
 * AC-4: deterministic setup-step candidates, collected from the repository's
 * own declared facts only — package scripts, an env-example file's presence,
 * and a compose file's declared SERVICE NAMES (never values, never a YAML
 * parse — a plain top-level-key scan). Every candidate carries the file that
 * evidenced it.
 *
 * `SETUP_STEPS_MAX` (the rendered section cap, AC-25) is enforced downstream
 * by grounding/render — this module returns every candidate it finds, up to
 * `FACT_SCRIPTS_MAX` for scripts specifically (the payload-budget cap, Q1).
 */

export interface SetupCandidate {
  /** The repository's own command text (untrusted repo content) — never
   *  invented or reformatted by this module. */
  command: string;
  kind: 'script' | 'env' | 'compose';
  evidenceFile: string;
}

const COMPOSE_FILENAMES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
const ENV_EXAMPLE_FILENAMES = ['.env.example', '.env.sample'];

export async function collectSetupCandidates(clonePath: string): Promise<SetupCandidate[]> {
  const candidates: SetupCandidate[] = [
    ...(await collectScriptCandidates(clonePath)),
  ];

  const envCandidate = await collectEnvCandidate(clonePath);
  if (envCandidate) candidates.push(envCandidate);

  const composeCandidate = await collectComposeCandidate(clonePath);
  if (composeCandidate) candidates.push(composeCandidate);

  return candidates;
}

async function collectScriptCandidates(clonePath: string): Promise<SetupCandidate[]> {
  const raw = await readCheckoutFile(clonePath, 'package.json');
  if (!raw) return [];
  let scripts: Record<string, unknown>;
  try {
    const pkg = JSON.parse(raw) as { scripts?: Record<string, unknown> };
    scripts = pkg.scripts ?? {};
  } catch {
    return [];
  }
  const out: SetupCandidate[] = [];
  for (const [, value] of Object.entries(scripts)) {
    if (out.length >= FACT_SCRIPTS_MAX) break;
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    out.push({
      command: value.trim().slice(0, MAX_SCRIPT_CHARS),
      kind: 'script',
      evidenceFile: 'package.json',
    });
  }
  return out;
}

async function collectEnvCandidate(clonePath: string): Promise<SetupCandidate | null> {
  for (const name of ENV_EXAMPLE_FILENAMES) {
    if (await fileExists(clonePath, name)) {
      return { command: `cp ${name} .env`, kind: 'env', evidenceFile: name };
    }
  }
  return null;
}

async function collectComposeCandidate(clonePath: string): Promise<SetupCandidate | null> {
  for (const name of COMPOSE_FILENAMES) {
    const raw = await readCheckoutFile(clonePath, name);
    if (raw === null) continue;
    const services = scanServiceNames(raw);
    if (services.length === 0) continue;
    return { command: 'docker compose up -d', kind: 'compose', evidenceFile: name };
  }
  return null;
}

/**
 * A `services:` TOP-LEVEL key scan — deliberately not a YAML parse (no
 * dependency, no value interpolation, so a hostile compose file's env-var
 * substitution / anchors / aliases are never evaluated). Finds the first
 * unindented `services:` line, then collects every immediately-following
 * line indented by exactly two spaces that looks like `  <name>:` as a
 * service name, stopping at the first line that dedents back to column 0 (or
 * EOF).
 */
export function scanServiceNames(composeText: string): string[] {
  const lines = composeText.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^services:\s*$/.test(l));
  if (startIdx === -1) return [];
  const names: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim().length === 0) continue;
    if (!/^\s/.test(line)) break; // dedented back to column 0 — services block ended
    const m = /^ {2}([A-Za-z0-9_.-]+):/.exec(line);
    if (m) names.push(m[1]!);
  }
  return names;
}
