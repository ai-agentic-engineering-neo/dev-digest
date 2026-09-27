/**
 * Accepted candidates → a skill body.
 *
 * The evidence travels INTO the skill on purpose. A reviewer agent reading
 * "prefer async/await" guesses at scope; the same rule with the three lines it
 * was learned from has an example to match against. And a year later, the
 * person asking "why is this a rule here?" gets the answer from the skill
 * rather than from whoever remembers the scan.
 *
 * Pure: candidates in, markdown out. No I/O, no clock — the caller passes the date.
 */
import { MAX_SNIPPET_LINES_IN_SKILL } from './constants.js';
import type { ConventionCandidate, ConventionCategory } from '@devdigest/shared';

/** Display order of the category headings; anything unlisted sorts last. */
const CATEGORY_ORDER: ConventionCategory[] = [
  'structure',
  'naming',
  'imports',
  'types',
  'api',
  'async',
  'error-handling',
  'logging',
  'testing',
  'other',
];

const CATEGORY_TITLES: Record<ConventionCategory, string> = {
  naming: 'Naming',
  structure: 'Structure',
  imports: 'Imports',
  types: 'Types',
  async: 'Async',
  'error-handling': 'Error handling',
  api: 'API',
  testing: 'Testing',
  logging: 'Logging',
  other: 'Other',
};

/** `path:12-18`, or `path:12` when the evidence is a single line. */
export function evidenceRef(c: Pick<ConventionCandidate, 'evidence_path' | 'evidence_line_start' | 'evidence_line_end'>): string {
  const start = c.evidence_line_start;
  const end = c.evidence_line_end;
  if (start == null) return c.evidence_path;
  return end != null && end !== start
    ? `${c.evidence_path}:${start}-${end}`
    : `${c.evidence_path}:${start}`;
}

/** Trim a snippet to the lines a reader will actually use. */
function clampSnippet(snippet: string): string {
  const lines = snippet.split('\n');
  if (lines.length <= MAX_SNIPPET_LINES_IN_SKILL) return snippet.trimEnd();
  return [...lines.slice(0, MAX_SNIPPET_LINES_IN_SKILL), '…'].join('\n');
}

/** A fence long enough to survive a snippet that itself contains backticks. */
function fenceFor(snippet: string): string {
  const longest = [...snippet.matchAll(/`+/g)].reduce((max, m) => Math.max(max, m[0].length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

export interface RenderSkillInput {
  name: string;
  repoFullName: string;
  headSha?: string | null;
  sampleCount: number;
  scannedOn?: string | null;
  candidates: ConventionCandidate[];
}

/**
 * Render the body. Only what the caller passes is rendered — filtering to
 * ACCEPTED candidates is the service's job and is enforced there, so a rejected
 * rule cannot reach this function by accident.
 */
export function renderConventionsSkill(input: RenderSkillInput): string {
  const provenance = [
    `extracted from ${input.sampleCount} sampled file${input.sampleCount === 1 ? '' : 's'}`,
    input.headSha ? `at \`${input.headSha.slice(0, 7)}\`` : null,
    input.scannedOn ? `on ${input.scannedOn}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const lines: string[] = [
    `# ${input.name}`,
    '',
    `House conventions for \`${input.repoFullName}\`, ${provenance}. Flag any change`,
    'that violates a rule below and cite the offending `file:line`. Do not flag code',
    'a rule does not cover, and do not restate a rule the diff already follows.',
  ];

  const byCategory = new Map<ConventionCategory, ConventionCandidate[]>();
  for (const c of input.candidates) {
    const list = byCategory.get(c.category);
    if (list) list.push(c);
    else byCategory.set(c.category, [c]);
  }

  const categories = [...byCategory.keys()].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b),
  );

  for (const category of categories) {
    lines.push('', `## ${CATEGORY_TITLES[category] ?? category}`);
    for (const c of byCategory.get(category)!) {
      const snippet = clampSnippet(c.evidence_snippet);
      const fence = fenceFor(snippet);
      lines.push('', `- **${c.rule.replace(/\s+/g, ' ').trim()}**`);
      // The "why" tells the reviewing agent how far the rule reaches — a rule
      // seen in 143 of 152 files is applied differently from one seen twice.
      const why = c.rationale?.replace(/\s+/g, ' ').trim();
      if (why) lines.push(`  Why: ${why}`);
      lines.push(`  Evidence: \`${evidenceRef(c)}\``);
      lines.push('', `${fence}`, snippet, `${fence}`);
    }
  }

  return lines.join('\n');
}

/** Default description — directive, and it says how many rules are inside. */
export function defaultSkillDescription(repoFullName: string, count: number): string {
  return `Flags changes that violate the ${count} house convention${count === 1 ? '' : 's'} extracted from ${repoFullName}, citing the offending file:line.`;
}
