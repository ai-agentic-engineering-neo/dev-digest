import type {
  SkillSafety,
  SkillSafetyFinding,
  SkillSafetyRule,
  SkillSafetySeverity,
} from '@devdigest/shared';

/**
 * Rule-based prompt-injection scan of a skill body (no LLM, deterministic).
 *
 * Skill bodies go into the review prompt as `## Skills / rules`, NOT wrapped
 * as untrusted, so a body must not try to steer the reviewer. This scan is an
 * extra gate in front of the prompt; it does NOT replace `INJECTION_GUARD`.
 *
 * Rules match concrete imperative phrases, not topics: a skill *about* prompt
 * injection ("flag untrusted input reaching an LLM") stays clean. Code fences
 * are scanned like any other text, because the model reads them too.
 *
 * Offsets are into the ORIGINAL body (the client highlights `start`–`end`), so
 * the text is never normalised before matching; regexes are case-insensitive
 * and whitespace-tolerant instead.
 */

/** Bump when rules change: stored results with an older version are re-scanned. */
export const SKILL_SCANNER_VERSION = 1;

/** At most this many findings are reported (a hostile body cannot blow up the reply). */
export const MAX_SKILL_FINDINGS = 50;

const EXCERPT_MAX = 120;

interface Rule {
  rule: SkillSafetyRule;
  severity: SkillSafetySeverity;
  patterns: RegExp[];
}

// Each pattern MUST carry the `g` flag (matchAll).
const RULES: readonly Rule[] = [
  {
    rule: 'override-instructions',
    severity: 'block',
    patterns: [
      // "ignore all previous instructions", "forget your system prompt"
      /\b(?:ignore|disregard|forget|override|bypass)\b[^\n.]{0,40}?\b(?:previous|prior|above|earlier|preceding|all|any|system|your|these)\b[^\n.]{0,30}?\b(?:instructions?|rules?|prompts?|guidelines?|directives?)\b/gi,
      // "disregard the rules above" — the qualifier comes after the noun
      /\b(?:ignore|disregard|forget|override|bypass)\s+(?:\w+\s+){0,3}?(?:instructions?|rules?|prompts?|guidelines?|directives?)\s+(?:above|before|so far|earlier|you (?:were|have been) given)\b/gi,
    ],
  },
  {
    rule: 'role-spoofing',
    severity: 'block',
    patterns: [
      /\byou are now\b/gi,
      /\bnew system prompt\b/gi,
      /\bact as (?:the )?system\b/gi,
      /<\/?\s*system\s*>/gi,
      /\[\/?INST\]/gi,
      /<\|im_(?:start|end)\|>/gi,
      /^[ \t]*#{1,6}[ \t]*system\b/gim,
      /^[ \t]*(?:system|assistant)[ \t]*:/gim,
    ],
  },
  {
    rule: 'delimiter-escape',
    severity: 'block',
    patterns: [
      /<\/?\s*untrusted\b/gi,
      /^[ \t]*#{1,6}[ \t]*(?:diff to review|skills \/ rules|pr description|repo skeleton|project context|callers of changed symbols)[ \t]*$/gim,
    ],
  },
  {
    rule: 'suppress-findings',
    severity: 'block',
    patterns: [
      /\b(?:always|auto-?)\s*approve\b/gi,
      /\b(?:do not|don't|never)\s+(?:report|flag|mention|raise)\s+(?:any\s+(?:issues?|findings?|problems?|vulnerabilit\w*)|anything|security\b|vulnerabilit\w*|secrets?\b|injections?\b|critical\b)/gi,
      /\bmark (?:it|this|the pr|everything|all findings) as (?:safe|approved|clean)\b/gi,
      /\bset (?:the )?score to 100\b/gi,
      /\bverdict\s*[:=]\s*["']?approve\b/gi,
    ],
  },
  {
    rule: 'exfiltration',
    severity: 'block',
    patterns: [
      // Markdown image / link to an external URL carrying a query string.
      /!?\[[^\]\n]*\]\(\s*https?:\/\/[^)\s]*\?[^)\s]*=[^)\s]*\)/gi,
      /\b(?:curl|wget)\b[^\n]*https?:\/\//gi,
      /\bfetch\(\s*["'`]https?:\/\//gi,
      /\b(?:send|post|upload|exfiltrate|forward|leak)\b[^\n.]{0,40}?\bto\s+https?:\/\//gi,
    ],
  },
  {
    rule: 'hidden-text',
    severity: 'block',
    patterns: [
      // Zero-width + BOM, and bidi overrides / isolates (text that reads differently).
      /[​-‍⁠﻿‪-‮⁦-⁩]+/g,
      /<!--[\s\S]*?-->/g,
    ],
  },
  {
    rule: 'encoded-payload',
    severity: 'warn',
    patterns: [/[A-Za-z0-9+/]{200,}={0,2}/g, /\b(?:[0-9a-fA-F]{2}){100,}\b/g],
  },
];

/** Make an excerpt readable: invisible chars become `\uXXXX`, newlines `⏎`, capped. */
function toExcerpt(text: string): string {
  const visible = text
    .replace(/[​-‍⁠﻿‪-‮⁦-⁩]/g, (c) =>
      `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
    )
    .replace(/\r?\n/g, ' ⏎ ')
    .trim();
  return visible.length > EXCERPT_MAX ? `${visible.slice(0, EXCERPT_MAX - 1)}…` : visible;
}

/** 1-based line of a char offset. */
function lineOf(body: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (body.charCodeAt(i) === 10) line++;
  return line;
}

type Span = { start: number; end: number };

/** Every match of the rule's patterns, sorted, with overlapping matches merged. */
function ruleSpans(body: string, patterns: readonly RegExp[]): Span[] {
  const spans: Span[] = [];
  for (const re of patterns) {
    for (const m of body.matchAll(re)) {
      const start = m.index ?? 0;
      if (m[0].length > 0) spans.push({ start, end: start + m[0].length });
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

/** All findings in the body, by position. */
export function findSkillInjections(body: string): SkillSafetyFinding[] {
  const found: SkillSafetyFinding[] = [];
  for (const { rule, severity, patterns } of RULES) {
    for (const { start, end } of ruleSpans(body, patterns)) {
      found.push({
        rule,
        severity,
        line: lineOf(body, start),
        start,
        end,
        excerpt: toExcerpt(body.slice(start, end)),
      });
    }
  }
  return found
    .sort((a, b) => a.start - b.start || a.rule.localeCompare(b.rule))
    .slice(0, MAX_SKILL_FINDINGS);
}

/** Scan a body. Any `block` finding → `flagged`. `scannedAt` is passed in (pure). */
export function scanSkillBody(body: string, scannedAt: string): SkillSafety {
  const findings = findSkillInjections(body);
  return {
    status: findings.some((f) => f.severity === 'block') ? 'flagged' : 'clean',
    findings,
    scanner_version: SKILL_SCANNER_VERSION,
    scanned_at: scannedAt,
  };
}

/**
 * The stored scan when it is current, otherwise a fresh scan of `body`
 * (legacy rows without a scan, or a scan by an older rule set).
 */
export function effectiveSkillSafety(
  stored: SkillSafety | null | undefined,
  body: string,
  fallbackAt: string,
): SkillSafety {
  if (stored && stored.scanner_version === SKILL_SCANNER_VERSION) return stored;
  return scanSkillBody(body, fallbackAt);
}

export function isSkillFlagged(safety: SkillSafety): boolean {
  return safety.status === 'flagged';
}
