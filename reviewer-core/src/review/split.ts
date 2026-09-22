/**
 * Oversize-diff guard. A chunk's diff text larger than `maxChars` is split at
 * hunk boundaries (each part re-carries its file header so it stays a valid,
 * groundable diff); a single hunk that alone exceeds the cap is truncated with
 * an explicit in-prompt note. Pure string work — hunks are never re-numbered.
 */
export interface SplitResult {
  parts: string[];
  /** true when at least one hunk had to be cut (content was dropped). */
  truncated: boolean;
}

interface Unit {
  header: string;
  hunk: string;
}

const truncationNote = (omitted: number, max: number) =>
  `\n[diff truncated by reviewer-core: ${omitted} chars omitted (maxDiffChars=${max})]`;

/** Split raw diff text into (file header, hunk) units, in order. */
function toUnits(raw: string): Unit[] {
  const units: Unit[] = [];
  let header: string[] = [];
  let hunk: string[] | null = null;
  const flush = () => {
    if (hunk) units.push({ header: header.join('\n'), hunk: hunk.join('\n') });
    hunk = null;
  };
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flush();
      header = [line];
    } else if (line.startsWith('@@')) {
      flush();
      hunk = [line];
    } else if (hunk) {
      hunk.push(line);
    } else {
      header.push(line);
    }
  }
  flush();
  return units;
}

/** Cut `text` to at most `max` chars (preferring a line boundary) plus a note. */
function truncateUnit(text: string, max: number): string {
  const room = Math.max(0, max - truncationNote(text.length, max).length);
  const cutAtLine = text.lastIndexOf('\n', room);
  const cut = cutAtLine > 0 ? cutAtLine : room;
  return text.slice(0, cut) + truncationNote(text.length - cut, max);
}

export function splitOversizeDiff(raw: string, maxChars: number): SplitResult {
  if (raw.length <= maxChars) return { parts: [raw], truncated: false };
  const units = toUnits(raw);
  if (units.length === 0) return { parts: [truncateUnit(raw, maxChars)], truncated: true };

  const parts: string[] = [];
  let truncated = false;
  let current = '';
  let currentHeader: string | null = null;
  for (const u of units) {
    const sameFile = current !== '' && currentHeader === u.header;
    const addition = sameFile ? `\n${u.hunk}` : `${current ? '\n' : ''}${u.header}\n${u.hunk}`;
    if (current.length + addition.length <= maxChars) {
      current += addition;
      currentHeader = u.header;
      continue;
    }
    if (current) parts.push(current);
    let fresh = `${u.header}\n${u.hunk}`;
    if (fresh.length > maxChars) {
      fresh = truncateUnit(fresh, maxChars);
      truncated = true;
    }
    current = fresh;
    currentHeader = u.header;
  }
  if (current) parts.push(current);
  return { parts, truncated };
}
