import type { PrBrief, Risk, RiskKind, ReviewFocusItem } from '@devdigest/shared';
import type { BriefFactSet } from './facts.js';
import type { BriefGenerationOutput } from './schemas.js';
import { lineInRanges } from './hunks.js';
import { MAX_FOCUS, MAX_RISKS, MAX_SENTENCES, RISK_KINDS } from './constants.js';

/**
 * Grounding (AC-16..AC-22, §5) — pure, brief-local. Structurally analogous to
 * `onboarding/grounding.ts`'s `groundTour` (D10) but deliberately NOT that
 * function, and never `groundFindings` (D14; `reviewer-core/CLAUDE.md`'s
 * Do-not-touch names it explicitly). Drop-don't-rewrite throughout: a bad
 * reference is removed, the surviving text is never edited to "fix" it.
 *
 * Reference sets (`changedFiles`/`blastFiles`/`knownEndpoints`/`knownCrons`/
 * `knownSymbols`) all come from the SAME `BriefFactSet` object that was
 * rendered into the prompt (`facts.ts`/`prompts.ts` share it) — see
 * plans/11-why-risk-brief.md §5.
 */

export interface GroundedDropped {
  paths: string[];
  lines: string[];
  citations: string[];
  links: string[];
  risks: string[];
  focus: string[];
}

export interface GroundBriefResult {
  brief: PrBrief;
  dropped: GroundedDropped;
}

export function groundBrief(raw: BriefGenerationOutput, facts: BriefFactSet): GroundBriefResult {
  const dropped: GroundedDropped = { paths: [], lines: [], citations: [], links: [], risks: [], focus: [] };

  const risks = groundRisks(raw.risks, facts, dropped);
  const reviewFocus = groundFocus(raw.review_focus, facts, dropped);
  const what = clampSentences(groundFreeText(raw.what, facts, dropped), MAX_SENTENCES);
  const why = clampSentences(groundFreeText(raw.why, facts, dropped), MAX_SENTENCES);

  // Q5 (planner recommendation) — bounds are enforced HERE, deterministically,
  // AFTER dropping: a risk dropped whole by AC-17 frees a slot rather than
  // silently shortening the surviving list.
  const brief: PrBrief = {
    what,
    why,
    risk_level: raw.risk_level,
    risks: risks.slice(0, MAX_RISKS),
    review_focus: reviewFocus.slice(0, MAX_FOCUS),
  };

  return { brief, dropped };
}

// ---------------------------------------------------------------------------
// Risks (AC-15..AC-17, AC-20).
// ---------------------------------------------------------------------------

interface GroundedRef {
  file: string;
  line: number | null;
}

function groundRisks(raw: BriefGenerationOutput['risks'], facts: BriefFactSet, dropped: GroundedDropped): Risk[] {
  const out: Risk[] = [];
  for (const r of raw) {
    const refs = groundFileRefs(r.file_refs, facts, dropped);
    if (refs.length === 0) {
      // AC-17: a risk with no surviving reference is dropped whole.
      dropped.risks.push(r.title);
      continue;
    }
    out.push({
      kind: normalizeKind(r.kind), // AC-15 — never a reason to drop the risk
      title: groundFreeText(r.title, facts, dropped),
      explanation: groundFreeText(r.explanation, facts, dropped),
      severity: r.severity,
      file_refs: refs.map(encodeFileRef),
    });
  }
  return out;
}

/** AC-16: a file reference naming a path outside `changedFiles ∪ blastFiles`
 *  is dropped. AC-20: a line outside every hunk range of its file survives as
 *  a file-only reference — the line is discarded, the reference is kept. */
function groundFileRefs(
  refs: BriefGenerationOutput['risks'][number]['file_refs'],
  facts: BriefFactSet,
  dropped: GroundedDropped,
): GroundedRef[] {
  const out: GroundedRef[] = [];
  for (const ref of refs) {
    const known = facts.changedFiles.has(ref.file) || facts.blastFiles.has(ref.file);
    if (!known) {
      dropped.paths.push(ref.file);
      continue;
    }
    out.push({ file: ref.file, line: groundLine(ref.file, ref.line ?? null, facts, dropped) });
  }
  return out;
}

function groundLine(file: string, line: number | null, facts: BriefFactSet, dropped: GroundedDropped): number | null {
  if (line == null) return null;
  const fileFact = facts.files.find((f) => f.path === file);
  if (fileFact && lineInRanges(line, fileFact.hunks)) return line;
  dropped.lines.push(`${file}:${line}`);
  return null;
}

function encodeFileRef(ref: GroundedRef): string {
  return ref.line != null ? `${ref.file}:${ref.line}` : ref.file;
}

/** AC-15: lowercase/trim/normalise dashes-to-underscores, match against the
 *  closed vocabulary; anything unrecognised becomes `other`. */
function normalizeKind(raw: string): RiskKind {
  const k = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (RISK_KINDS as readonly string[]).includes(k) ? (k as RiskKind) : 'other';
}

// ---------------------------------------------------------------------------
// Review focus (AC-19, AC-20).
// ---------------------------------------------------------------------------

function groundFocus(
  raw: BriefGenerationOutput['review_focus'],
  facts: BriefFactSet,
  dropped: GroundedDropped,
): ReviewFocusItem[] {
  const out: ReviewFocusItem[] = [];
  for (const f of raw) {
    // AC-19: strictly `changedFiles` — stricter than AC-16's risk rule, which
    // also allows a blast-only caller file (this is a reading order for
    // THIS diff, not a broader risk radius).
    if (!facts.changedFiles.has(f.file)) {
      dropped.focus.push(f.file);
      continue;
    }
    out.push({
      file: f.file,
      line: groundLine(f.file, f.line ?? null, facts, dropped),
      reason: groundFreeText(f.reason, facts, dropped),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// AC-21 link/image neutralisation + AC-18 bare endpoint/cron/symbol citations.
// ---------------------------------------------------------------------------

const INLINE_LINK_OR_IMAGE_RE = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
const REFERENCE_DEFINITION_RE = /^[ \t]{0,3}\[([^\]]+)\]:\s*(\S+)(?:[ \t]+.*)?$/gm;
const EXTERNAL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function isAllowedLinkTarget(rawTarget: string, facts: BriefFactSet): boolean {
  const target = rawTarget.trim();
  if (target.length === 0) return false;
  if (EXTERNAL_SCHEME_RE.test(target)) return false; // http:, https:, javascript:, mailto:, …
  if (target.startsWith('/') || target.startsWith('//')) return false; // absolute / protocol-relative
  return facts.changedFiles.has(target) || facts.blastFiles.has(target);
}

/**
 * AC-21: strips any markdown link/image (inline AND reference-style) whose
 * target isn't a repo-relative path present in the fact set, keeping the
 * visible text — `onboarding/grounding.ts`'s `neutralizeBody`, applied to
 * this feature's allow-set. Required because `Markdown.tsx` constrains no
 * URL (finding 6).
 */
function neutralizeLinks(body: string, facts: BriefFactSet, dropped: GroundedDropped): string {
  if (!body) return body;

  let out = body.replace(INLINE_LINK_OR_IMAGE_RE, (match, _bang: string, label: string, rawTarget: string) => {
    const target = (rawTarget.split(/\s+/)[0] ?? '').trim();
    if (isAllowedLinkTarget(target, facts)) return match;
    dropped.links.push(target);
    return label;
  });

  out = out.replace(REFERENCE_DEFINITION_RE, (match, _refId: string, rawTarget: string) => {
    const target = rawTarget.trim();
    if (isAllowedLinkTarget(target, facts)) return match;
    dropped.links.push(target);
    return '';
  });

  return out;
}

const ENDPOINT_MENTION_RE = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s`,;)]*)/g;
const BACKTICK_TOKEN_RE = /`([^`]+)`/g;
const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;
const CRON_SHAPE_RE = /^(\S+\s+){4}\S+$/;

/**
 * AC-18: a bare "METHOD /path" mention, or a backtick-quoted symbol/cron
 * token, that isn't in the fact set's blast-radius facts is dropped as a
 * citation. There is no structured endpoint/cron/symbol field in the raw
 * schema (Approach §4) — these are the two shapes a model realistically
 * produces for such a claim in free text, so this is a deliberate,
 * documented heuristic rather than exhaustive text understanding. A
 * backtick token that names a real changed/blast FILE is left untouched —
 * that is a path citation, governed by `groundFileRefs`/AC-16, not this rule.
 */
function scanCitations(text: string, facts: BriefFactSet, dropped: GroundedDropped): string {
  let out = text.replace(ENDPOINT_MENTION_RE, (match, method: string, path: string) => {
    const token = `${method} ${path}`;
    if (facts.knownEndpoints.has(token)) return match;
    dropped.citations.push(token);
    return `${method} an endpoint`;
  });

  out = out.replace(BACKTICK_TOKEN_RE, (match, rawToken: string) => {
    const token = rawToken.trim();
    if (facts.changedFiles.has(token) || facts.blastFiles.has(token)) return match; // a file citation, not this rule's concern
    if (IDENTIFIER_RE.test(token) && token.length > 1) {
      if (facts.knownSymbols.has(token)) return match;
      dropped.citations.push(token);
      return token; // keep the visible word, drop the "verified symbol" framing
    }
    if (CRON_SHAPE_RE.test(token)) {
      if (facts.knownCrons.has(token)) return match;
      dropped.citations.push(token);
      return token;
    }
    return match;
  });

  return out;
}

function groundFreeText(text: string, facts: BriefFactSet, dropped: GroundedDropped): string {
  return scanCitations(neutralizeLinks(text, facts, dropped), facts, dropped);
}

/**
 * Q5: keeps the first `maxSentences` sentences of `what`/`why` only — never
 * applied to a risk's title/explanation or a focus entry's reason (Approach
 * §4's bounds table names only *what* and *why*). Simple deterministic
 * sentence-boundary split (terminal `.`/`!`/`?` + whitespace); does not claim
 * full NLP accuracy — adequate for short model-authored prose.
 */
function clampSentences(text: string, maxSentences: number): string {
  if (!text) return text;
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g);
  if (!sentences || sentences.length <= maxSentences) return text.trim();
  return sentences.slice(0, maxSentences).join('').trim();
}
