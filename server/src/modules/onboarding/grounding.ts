import type { OnboardingEntry, OnboardingSection } from '@devdigest/shared';
import type { FactSet } from './facts.js';
import type { OnboardingGenerationOutput } from './schemas.js';
import { SETUP_STEPS_MAX } from './constants.js';

/**
 * Grounding (AC-27..AC-32) — pure, onboarding-local. Structurally analogous
 * to `groundFindings` (reviewer-core) but deliberately NOT that function or a
 * wrapper around it: D9 keeps the review path untouched, and
 * `reviewer-core/CLAUDE.md`'s "Do-not-touch" names `groundFindings`
 * explicitly. Nothing here enters the review path.
 *
 * "Structured targets" (AC-32) are enforced by construction: the raw schema
 * (`schemas.ts`, Q3) has no free-form link field at all — every path the
 * model can name lives inside a `critical_paths`/`reading_path` entry or a
 * `first_tasks` task's `files`, and those are ALL checked against
 * `facts.allIndexedPaths` below (AC-28), which is the same check AC-32 asks
 * for on a "structured" target. `OnboardingSection.links` (the vestigial
 * `OnboardingLink[]` field) is therefore always empty — this feature never
 * populates it; the client builds each entry's "Open" link itself from
 * `entry.path` (AC-44).
 *
 * The remaining, EASY-TO-MISS half of AC-32 is body TEXT: `body` is free
 * markdown rendered by a primitive (`Markdown.tsx`) that constrains no URL
 * (planner finding 10) — `neutralizeBody` scans every section's `body` for a
 * markdown link/image target (inline AND reference-style) and strips the
 * wrapper (keeping visible text) for any target that isn't an index-present
 * repo-relative path.
 */

export interface GroundedDropped {
  paths: string[];
  commands: string[];
  links: string[];
  tasks: string[];
}

export interface GroundTourResult {
  sections: OnboardingSection[];
  dropped: GroundedDropped;
}

export function groundTour(raw: OnboardingGenerationOutput, facts: FactSet): GroundTourResult {
  const dropped: GroundedDropped = { paths: [], commands: [], links: [], tasks: [] };

  // AC-16: always the five fixed kinds, in order — never response-driven.
  const sections: OnboardingSection[] = [
    groundArchitecture(raw, facts, dropped),
    groundCriticalPaths(raw, facts, dropped),
    groundRunLocally(raw, facts, dropped),
    groundReadingPath(raw, facts, dropped),
    groundFirstTasks(raw, facts, dropped),
  ];

  return { sections, dropped };
}

function groundArchitecture(
  raw: OnboardingGenerationOutput,
  facts: FactSet,
  dropped: GroundedDropped,
): OnboardingSection {
  return {
    kind: 'architecture',
    title: raw.architecture.title,
    body: neutralizeBody(raw.architecture.body, facts.allIndexedPaths, dropped.links),
    // AC-17: the ONLY section the raw schema even allows a diagram on — there
    // is nothing to "drop" for the other four kinds, by construction.
    diagram: raw.architecture.diagram,
    links: [],
  };
}

function groundCriticalPaths(
  raw: OnboardingGenerationOutput,
  facts: FactSet,
  dropped: GroundedDropped,
): OnboardingSection {
  const reasonByRoot = new Map(raw.critical_paths.entries.map((e) => [e.path, e.reason]));
  const entries: OnboardingEntry[] = [];
  for (const c of facts.criticalPaths) {
    // AC-28 (chains): every hop must still be indexed, or the WHOLE entry is
    // dropped — a chain comes from `file_edges`; a bad hop means the index
    // moved under us, and showing half a chain would misdescribe it.
    const allHopsKnown = c.chain.every((hop) => facts.allIndexedPaths.has(hop));
    if (!allHopsKnown) {
      dropped.paths.push(c.root);
      continue;
    }
    const hops = c.chain.slice(1); // breadcrumb = everything AFTER the root
    entries.push({
      path: c.root,
      ...(hops.length > 0 ? { chain: hops } : {}),
      // Q4: a deterministic entry whose reason the model omitted is KEPT,
      // rendered without a reason — never dropped for that alone.
      ...(reasonByRoot.get(c.root) ? { reason: reasonByRoot.get(c.root) } : {}),
    });
  }
  return {
    kind: 'critical_paths',
    title: raw.critical_paths.title,
    body: neutralizeBody(raw.critical_paths.intro ?? '', facts.allIndexedPaths, dropped.links),
    links: [],
    entries,
  };
}

function groundRunLocally(
  raw: OnboardingGenerationOutput,
  facts: FactSet,
  dropped: GroundedDropped,
): OnboardingSection {
  const allowed = new Set(facts.setupCandidates.map((c) => c.command));
  const survivors = raw.run_locally.steps
    .filter((s) => {
      const command = s.command.trim();
      if (allowed.has(command)) return true;
      dropped.commands.push(command); // AC-29: no fuzzy matching
      return false;
    })
    .slice(0, SETUP_STEPS_MAX); // AC-25

  const lines = survivors.map((s) => `- \`${s.command.trim()}\`${s.reason ? ` — ${s.reason}` : ''}`);
  const intro = raw.run_locally.intro ? `${raw.run_locally.intro}\n\n` : '';
  const body = neutralizeBody(`${intro}${lines.join('\n')}`, facts.allIndexedPaths, dropped.links);

  return { kind: 'run_locally', title: raw.run_locally.title, body, links: [] };
}

function groundReadingPath(
  raw: OnboardingGenerationOutput,
  facts: FactSet,
  dropped: GroundedDropped,
): OnboardingSection {
  // AC-27: rebuilt from the server's weighted order; response order is
  // discarded entirely, and every path here is already index-present by
  // construction (it came FROM the index) — nothing to drop.
  const reasonByPath = new Map(raw.reading_path.entries.map((e) => [e.path, e.reason]));
  const entries: OnboardingEntry[] = facts.readingPath.map((e) => ({
    path: e.path,
    ...(reasonByPath.get(e.path) ? { reason: reasonByPath.get(e.path) } : {}),
  }));
  return {
    kind: 'reading_path',
    title: raw.reading_path.title,
    body: neutralizeBody(raw.reading_path.intro ?? '', facts.allIndexedPaths, dropped.links),
    links: [],
    entries,
  };
}

function groundFirstTasks(
  raw: OnboardingGenerationOutput,
  facts: FactSet,
  dropped: GroundedDropped,
): OnboardingSection {
  const blocks: string[] = [];
  for (const task of raw.first_tasks.tasks) {
    const knownFiles = task.files.filter((f) => facts.allIndexedPaths.has(f));
    if (knownFiles.length === 0) {
      // AC-31: a task with no surviving indexed file reference is dropped
      // whole; Q4 — keep the survivors (0..5), never re-prompt.
      dropped.tasks.push(task.title);
      continue;
    }
    const filesLine = knownFiles.map((f) => `\`${f}\``).join(', ');
    blocks.push(`### ${task.title}\n\n${task.body}\n\nFiles: ${filesLine}`);
  }

  const intro = raw.first_tasks.intro ? `${raw.first_tasks.intro}\n\n` : '';
  // AC-31: labelled model-suggested, not derived.
  const label = '_Model-suggested — not verified against the codebase beyond the files cited._\n\n';
  const body = neutralizeBody(`${label}${intro}${blocks.join('\n\n')}`, facts.allIndexedPaths, dropped.links);

  return { kind: 'first_tasks', title: raw.first_tasks.title, body, links: [] };
}

// ---------------------------------------------------------------------------
// AC-32 body-text neutralization.
// ---------------------------------------------------------------------------

const INLINE_LINK_OR_IMAGE_RE = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
const REFERENCE_DEFINITION_RE = /^[ \t]{0,3}\[([^\]]+)\]:\s*(\S+)(?:[ \t]+.*)?$/gm;
const EXTERNAL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function isAllowedTarget(rawTarget: string, allIndexedPaths: ReadonlySet<string>): boolean {
  const target = rawTarget.trim();
  if (target.length === 0) return false;
  if (EXTERNAL_SCHEME_RE.test(target)) return false; // http:, https:, javascript:, mailto:, …
  if (target.startsWith('/') || target.startsWith('//')) return false; // absolute / protocol-relative
  return allIndexedPaths.has(target);
}

/**
 * Scans `body` markdown for inline `[label](target)` / `![alt](target)`
 * links/images AND reference-style `[id]: target` definitions, and — for any
 * target that is not an index-present repo-relative path — strips the
 * link/image construct while KEEPING its visible text (drop-don't-rewrite,
 * the same stance as every other grounding rule). Every dropped target is
 * appended to `droppedLinks`.
 */
export function neutralizeBody(
  body: string,
  allIndexedPaths: ReadonlySet<string>,
  droppedLinks: string[],
): string {
  if (!body) return body;

  let out = body.replace(INLINE_LINK_OR_IMAGE_RE, (match, _bang: string, label: string, rawTarget: string) => {
    const target = (rawTarget.split(/\s+/)[0] ?? '').trim();
    if (isAllowedTarget(target, allIndexedPaths)) return match;
    droppedLinks.push(target);
    return label; // visible text kept; the `!`/brackets/parens are dropped
  });

  out = out.replace(REFERENCE_DEFINITION_RE, (match, _refId: string, rawTarget: string) => {
    const target = rawTarget.trim();
    if (isAllowedTarget(target, allIndexedPaths)) return match;
    droppedLinks.push(target);
    // Drop the whole definition line — with no definition, `[label][id]`
    // elsewhere in the body simply renders as literal bracket text, never a
    // live link.
    return '';
  });

  return out;
}
