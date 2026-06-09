/**
 * Prompt template loader.
 *
 * Prompt *instructions* live as editable files under `src/prompts/*.md` (kept
 * out of the logic), loaded here and interpolated with `{{var}}` placeholders.
 * No template engine / dependency — a small mustache-style replace is enough.
 *
 * Dynamic, per-request DATA (facts, diffs, file trees) is still assembled in
 * code and wrapped via platform/prompt.ts; only the stable instruction text
 * belongs in a template.
 *
 * NOTE: templates are read relative to this module, i.e. `src/prompts` under
 * `tsx` (dev) and `dist/prompts` in a compiled build — so a production `build`
 * must copy `src/prompts` → `dist/prompts` (dev via `tsx` needs no copy).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
const cache = new Map<string, string>();

/** Read a raw template file (e.g. "onboarding.system.md"), cached. */
export async function loadPromptTemplate(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const raw = await readFile(join(PROMPTS_DIR, name), 'utf8');
  cache.set(name, raw);
  return raw;
}

/** Replace `{{key}}` with vars[key]; unknown placeholders are left intact. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    key in vars ? (vars[key] ?? '') : whole,
  );
}

/** Load a template by name and interpolate it in one step. */
export async function renderPrompt(name: string, vars: Record<string, string>): Promise<string> {
  return renderTemplate(await loadPromptTemplate(name), vars);
}
