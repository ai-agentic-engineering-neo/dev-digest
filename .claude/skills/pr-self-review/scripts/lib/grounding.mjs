// Pure grounding: tie each reported finding to a real line, classify new vs pre-existing, dedupe.
import { SEVERITIES, severityRank, sha256 } from './util.mjs';

const WINDOW = 5; // lines either side of the reported line to look for the quote
const MIN_QUOTE = 8; // shorter quotes ("}", "return") must match exactly at the reported line

export const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

/** Returns the 1-based line where the quote's first non-empty line occurs, or null. */
export function locateQuote(lines, quote, reportedLine) {
  const qLines = String(quote ?? '').split('\n').map(norm).filter(Boolean);
  if (qLines.length === 0 || !lines) return null;
  const first = qLines[0];
  const hit = (i) => {
    const l = norm(lines[i - 1]);
    return first.length >= MIN_QUOTE ? l.includes(first) : l === first;
  };
  const at = Number.isInteger(reportedLine) ? reportedLine : 0;
  if (at >= 1 && at <= lines.length && hit(at)) return at;
  if (first.length < MIN_QUOTE) return null;
  for (let d = 1; d <= WINDOW; d++) {
    if (at - d >= 1 && at - d <= lines.length && hit(at - d)) return at - d;
    if (at + d >= 1 && at + d <= lines.length && hit(at + d)) return at + d;
  }
  let best = null;
  for (let i = 1; i <= lines.length; i++) {
    if (hit(i) && (best === null || Math.abs(i - at) < Math.abs(best - at))) best = i;
  }
  return best;
}

export function quoteSpan(quote) {
  return Math.max(1, String(quote ?? '').split('\n').map(norm).filter(Boolean).length);
}

export function overlaps(ranges = [], start, end) {
  return ranges.some(([s, e]) => start <= e && end >= s);
}

/** Stable id for suppressions: survives re-review because it ignores the LLM's wording. */
export function findingFingerprint(skill, file, quote) {
  return sha256('finding-v1', skill, file, norm(quote));
}

const REQUIRED = ['file', 'line', 'quote', 'severity', 'title'];

/**
 * @param raw       [{ ...finding, skill, bucket }] as reported by reviewer agents
 * @param ctx       { bucketFiles: Map<bucketId, Set<file>>, linesOf(file) → string[]|null, rangesOf(file) → ranges }
 * @returns { findings, pre_existing, dropped }
 */
export function groundFindings(raw, ctx) {
  const kept = [];
  const dropped = [];
  for (const f of raw) {
    const missing = REQUIRED.filter((k) => f[k] === undefined || f[k] === null || f[k] === '');
    if (missing.length) {
      dropped.push({ ...f, dropped_reason: `missing fields: ${missing.join(', ')}` });
      continue;
    }
    if (!SEVERITIES.includes(f.severity)) {
      dropped.push({ ...f, dropped_reason: `invalid severity "${f.severity}"` });
      continue;
    }
    if (!ctx.bucketFiles.get(f.bucket)?.has(f.file)) {
      dropped.push({ ...f, dropped_reason: 'file outside the bucket that reported it' });
      continue;
    }
    const line = locateQuote(ctx.linesOf(f.file), f.quote, Number(f.line));
    if (line === null) {
      dropped.push({ ...f, dropped_reason: 'ungrounded: quote not found in file' });
      continue;
    }
    const end = line + quoteSpan(f.quote) - 1;
    kept.push({
      ...f,
      line,
      reported_line: Number(f.line),
      is_new: overlaps(ctx.rangesOf(f.file), line, end),
      fingerprint: findingFingerprint(f.skill, f.file, f.quote),
    });
  }

  // Same file + line from several skills → one finding, highest severity wins.
  const merged = new Map();
  for (const f of kept) {
    const key = `${f.file}:${f.line}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...f, skills: [f.skill], fingerprints: [f.fingerprint] });
      continue;
    }
    const skills = [...new Set([...prev.skills, f.skill])];
    const fingerprints = [...new Set([...prev.fingerprints, f.fingerprint])];
    const winner = severityRank(f.severity) > severityRank(prev.severity) ? f : prev;
    merged.set(key, { ...winner, skills, fingerprints, is_new: prev.is_new || f.is_new });
  }
  const bySeverity = (a, b) =>
    severityRank(b.severity) - severityRank(a.severity) || a.file.localeCompare(b.file) || a.line - b.line;
  const all = [...merged.values()].sort((a, b) => Number(b.is_new) - Number(a.is_new) || bySeverity(a, b));
  all.forEach((f, i) => (f.id = `F${String(i + 1).padStart(3, '0')}`));
  return {
    findings: all.filter((f) => f.is_new),
    pre_existing: all.filter((f) => !f.is_new),
    dropped,
  };
}
