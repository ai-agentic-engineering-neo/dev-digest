import type { ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '../../platform/prompt.js';
import type { FactSet } from './facts.js';
import type { Tokenizer } from './ports.js';
import { ONBOARDING_FACTS_TOKEN_BUDGET, SECTION_KINDS } from './constants.js';

/**
 * System prompt + fact-payload renderer for onboarding's ONE structured call.
 *
 * Guard decision (planner finding 9): `INJECTION_GUARD` is imported from
 * `platform/prompt.js` (itself re-exporting the now-exported
 * `reviewer-core` const) and appended to the system prompt exactly as
 * `assemblePrompt` does — this module never calls `assemblePrompt` (D9 keeps
 * the review path untouched), but reuses the SAME shared guard text rather
 * than writing a second one (`server/CLAUDE.md`'s "one shared guard, not
 * denylists"). The guard string itself is never edited here.
 *
 * Every repository-derived string (paths, script text, route strings) is
 * wrapped via `wrapUntrusted(label, content)` before it reaches the prompt —
 * it is DATA, never instructions, no matter what a hostile script name/body
 * claims to be.
 */

export const ONBOARDING_SYSTEM_PROMPT = `You write a repository's Onboarding Tour: a five-section guide for someone
meeting this codebase for the first time. You are given a DETERMINISTIC fact
set — detected stack, a directory skeleton, a ranked file pool, dependency
chains, declared setup commands, and detected routes/crons — collected by the
product, never by you. You do not have file contents; do not invent code you
cannot see.

Produce exactly five sections, matching this structure:
  1. architecture   — a short narrative (title, body markdown) describing the
     system, and OPTIONALLY one Mermaid diagram of its major components/flow.
  2. critical_paths  — one short reason (one sentence) for EACH critical-path
     chain root given to you, keyed by its exact path. Do not invent chains or
     reorder them; you are only asked for the reason text.
  3. run_locally     — steps to run the repo locally. Each step's "command"
     MUST be copied VERBATIM from the "Setup command candidates" list — never
     paraphrase, combine, or invent a command that isn't in that list.
  4. reading_path    — one short reason for EACH file in the "Reading path"
     list, keyed by its exact path, in the order given. Do not reorder them.
  5. first_tasks     — 3 to 5 concrete starter tasks a newcomer could do. Each
     task needs a title, a short body, and a "files" list naming ONLY paths
     that appear in the "Ranked files" or "Directory skeleton" facts below —
     never a path you have not been given.

Every path you reference MUST be copied verbatim from the facts you were
given. Every command you propose in run_locally MUST be copied verbatim from
the setup command candidates. If you are unsure a path or command is real,
leave it out rather than guess — an ungrounded reference is dropped before any
reader sees it, so guessing only wastes your own output.`;

interface PayloadFlags {
  includeCrons: boolean;
  includeRoutes: boolean;
  dirLimit: number;
  rankedLimit: number;
  scriptsLimit: number;
}

/**
 * Drop-don't-truncate order (Q1, decided): while the payload exceeds budget,
 * whole entries are dropped in this fixed order — crons, then routes
 * entirely, then directory entries beyond 20, then ranked files beyond 20,
 * then setup candidates beyond 10. Coverage, stack, reading-path (≤10),
 * critical-path chains (≤10), and the first 10 setup candidates are NEVER
 * dropped.
 */
const DROP_STEPS: ReadonlyArray<(f: PayloadFlags) => PayloadFlags> = [
  (f) => ({ ...f, includeCrons: false }),
  (f) => ({ ...f, includeRoutes: false }),
  (f) => ({ ...f, dirLimit: Math.min(f.dirLimit, 20) }),
  (f) => ({ ...f, rankedLimit: Math.min(f.rankedLimit, 20) }),
  (f) => ({ ...f, scriptsLimit: Math.min(f.scriptsLimit, 10) }),
];

export interface RenderedFactsPayload {
  text: string;
  tokens: number;
  dropped: {
    crons: boolean;
    routes: boolean;
    directoryBeyond20: boolean;
    rankedFilesBeyond20: boolean;
    scriptsBeyond10: boolean;
  };
}

/** Renders the fact payload, applying the drop order until it fits
 *  `ONBOARDING_FACTS_TOKEN_BUDGET` (or nothing more can be dropped — the
 *  payload is returned as-is; entries are never truncated mid-entry). */
export function renderFactsPayload(facts: FactSet, tokenizer: Tokenizer): RenderedFactsPayload {
  let flags: PayloadFlags = {
    includeCrons: true,
    includeRoutes: true,
    dirLimit: facts.directory.length,
    rankedLimit: facts.rankedFiles.length,
    scriptsLimit: facts.setupCandidates.length,
  };

  let stepIdx = 0;
  for (;;) {
    const text = buildPayloadText(facts, flags);
    const tokens = tokenizer.count(text);
    if (tokens <= ONBOARDING_FACTS_TOKEN_BUDGET || stepIdx >= DROP_STEPS.length) {
      return {
        text,
        tokens,
        dropped: {
          crons: !flags.includeCrons,
          routes: !flags.includeRoutes,
          directoryBeyond20: flags.dirLimit < facts.directory.length,
          rankedFilesBeyond20: flags.rankedLimit < facts.rankedFiles.length,
          scriptsBeyond10: flags.scriptsLimit < facts.setupCandidates.length,
        },
      };
    }
    flags = DROP_STEPS[stepIdx]!(flags);
    stepIdx += 1;
  }
}

function buildPayloadText(facts: FactSet, flags: PayloadFlags): string {
  const sections: string[] = [];

  sections.push(renderCoverage(facts));
  sections.push(renderStack(facts));

  const dir = facts.directory.slice(0, flags.dirLimit);
  if (dir.length > 0) {
    sections.push(`## Directory skeleton\n${wrapUntrusted('directory', dir.join('\n'))}`);
  }

  const ranked = facts.rankedFiles.slice(0, flags.rankedLimit);
  if (ranked.length > 0) {
    const lines = ranked
      .map((r) => `${r.path} — weighted=${r.weighted.toFixed(3)} (pagerank=${r.pagerank.toFixed(3)}, hotness=${r.hotness.toFixed(2)})`)
      .join('\n');
    sections.push(`## Ranked files (candidate pool, weighted desc)\n${wrapUntrusted('ranked-files', lines)}`);
  }

  if (facts.readingPath.length > 0) {
    const lines = facts.readingPath.map((e, i) => `${i + 1}. ${e.path}`).join('\n');
    sections.push(
      `## Reading path (write ONE reason per path, keyed by exact path, do not reorder)\n${wrapUntrusted('reading-path', lines)}`,
    );
  }

  if (facts.criticalPaths.length > 0) {
    const lines = facts.criticalPaths
      .map((c) => `${c.root} (chain: ${c.chain.join(' -> ')})`)
      .join('\n');
    sections.push(
      `## Critical-path chains (write ONE reason per chain, keyed by the root path)\n${wrapUntrusted('critical-paths', lines)}`,
    );
  }

  const setup = facts.setupCandidates.slice(0, flags.scriptsLimit);
  if (setup.length > 0) {
    const lines = setup.map((c, i) => `${i + 1}. [${c.kind}] "${c.command}" (${c.evidenceFile})`).join('\n');
    sections.push(
      `## Setup command candidates (choose ONLY from this list, verbatim)\n${wrapUntrusted('setup-candidates', lines)}`,
    );
  }

  if (flags.includeRoutes && facts.routes.length > 0) {
    const lines = facts.routes
      .map((r) => {
        const endpoints = r.endpoints.length > 0 ? `endpoints: ${r.endpoints.join(', ')}` : '';
        const crons = flags.includeCrons && r.crons.length > 0 ? `crons: ${r.crons.join(', ')}` : '';
        return [`${r.file}`, endpoints, crons].filter(Boolean).join(' — ');
      })
      .join('\n');
    sections.push(`## Detected routes / crons\n${wrapUntrusted('routes', lines)}`);
  }

  return sections.join('\n\n');
}

function renderCoverage(facts: FactSet): string {
  const c = facts.coverage;
  const lines = [
    `files indexed: ${c.filesIndexed}`,
    `files excluded by the index bound: ${c.filesExcluded}`,
    `index status: ${c.indexStatus}${c.indexReason ? ` (reason: ${c.indexReason})` : ''}`,
    `index sha: ${c.indexSha}`,
    `PRs weighted for churn: ${c.prsWeighted} (window: ${c.hotnessWindowDays} days)`,
  ];
  return `## Index coverage\n${lines.join('\n')}`;
}

function renderStack(facts: FactSet): string {
  const s = facts.stack;
  const lines: string[] = [];
  if (s.language) lines.push(`language: ${s.language.value} (${s.language.evidenceFile})`);
  if (s.runtime) lines.push(`runtime: ${s.runtime.value} (${s.runtime.evidenceFile})`);
  if (s.packageManager) lines.push(`package manager: ${s.packageManager.value} (${s.packageManager.evidenceFile})`);
  if (s.frameworks.length > 0) {
    lines.push(`frameworks: ${s.frameworks.map((f) => `${f.value} (${f.evidenceFile})`).join(', ')}`);
  }
  const body = lines.length > 0 ? lines.join('\n') : '(no stack detected)';
  return `## Detected stack\n${wrapUntrusted('stack', body)}`;
}

/** The full messages array for the one `completeStructured` call. */
export function buildOnboardingMessages(
  facts: FactSet,
  tokenizer: Tokenizer,
): { messages: ChatMessage[]; payload: RenderedFactsPayload } {
  const payload = renderFactsPayload(facts, tokenizer);
  const system = `${ONBOARDING_SYSTEM_PROMPT}\n\n${INJECTION_GUARD}`;
  const user = `Produce the five sections (${SECTION_KINDS.join(', ')}) from the facts below.\n\n${payload.text}`;
  return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], payload };
}
