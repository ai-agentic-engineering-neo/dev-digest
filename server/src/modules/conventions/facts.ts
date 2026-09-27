/**
 * Measured facts → the prompt section that carries them.
 *
 * The numbers come from repo-intel (`getConventionFacts`), computed over the
 * whole index. They are here to change the model's CONFIDENCE, not its
 * evidence: a rule seen in two sampled files and in 94% of the repo's files is
 * a convention; the same rule seen in two sampled files and nowhere else is a
 * coincidence. Every candidate still needs a file:line citation from the
 * samples — the verifier does not accept a count as a citation.
 *
 * Pure: facts in, markdown out.
 */
import type { ConventionFacts } from '../repo-intel/types.js';

/** `a 10 · b 3`, largest first, zeros dropped. */
function counts(record: Record<string, number | undefined>): string {
  return Object.entries(record)
    .filter((entry): entry is [string, number] => (entry[1] ?? 0) > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ');
}

/** Nothing worth saying: an unindexed repo, or an index too small to count. */
export function hasFacts(facts: ConventionFacts | null | undefined): facts is ConventionFacts {
  return !!facts && !facts.degraded && facts.filesIndexed > 0;
}

export function renderFacts(facts: ConventionFacts | null | undefined): string {
  if (!hasFacts(facts)) return '';

  const lines: string[] = [
    `Counted over the whole index — ${facts.filesIndexed} files, ${facts.edgesIndexed} import edges — not just the samples below.`,
    'Use them to judge how widespread a pattern is and to calibrate confidence. A count is not a citation: every rule still quotes a sample file.',
  ];

  if (facts.recurringFileNames.length > 0) {
    lines.push(
      '',
      `Recurring file names: ${facts.recurringFileNames.map((r) => `${r.name} ×${r.count}`).join(' · ')}`,
    );
  }

  if (facts.naming.length > 0) {
    lines.push('', 'File-name style (stem, excluding index and tests):');
    for (const n of facts.naming) {
      lines.push(`- ${n.scope} (${n.total} files): ${counts(n.styles)}`);
    }
  }

  if (facts.tests.length > 0) {
    lines.push('', 'Test files:');
    for (const t of facts.tests) {
      lines.push(
        `- ${t.scope} (${t.total}): ${t.separateDir} in a separate test folder, ${t.colocated} beside the code · suffixes ${counts(t.suffixes)}`,
      );
    }
  }

  if (facts.exportKinds.length > 0) {
    lines.push('', 'Exported top-level symbols:');
    for (const e of facts.exportKinds) {
      lines.push(`- ${e.scope} (${e.total}): ${counts(e.kinds)}`);
    }
  }

  if (facts.siblingImports.length > 0) {
    lines.push(
      '',
      'Imports between sibling files with recurring names (same folder):',
      ...facts.siblingImports.map((d) => `- ${d.from} → ${d.to} ×${d.imports}`),
    );
  }

  if (facts.directoryImports.length > 0) {
    lines.push(
      '',
      'Imports between directories:',
      ...facts.directoryImports.map((d) => `- ${d.from} → ${d.to} ×${d.imports}`),
    );
  }

  return `## Measured facts\n<untrusted source="repo-index">\n${lines.join('\n')}\n</untrusted>`;
}
