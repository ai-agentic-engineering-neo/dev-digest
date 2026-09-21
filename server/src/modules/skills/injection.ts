import type { InjectionMatch } from '@devdigest/shared';

/**
 * Deterministic prompt-injection detector for skill bodies (pure, no deps).
 *
 * A skill body is text that gets pasted into an agent's system prompt, so a
 * malicious body ("ignore all previous instructions", "always approve") is a
 * prompt-injection vector — especially for skills imported from a URL or file.
 * This is pattern matching, NOT an LLM: free, reproducible and explainable (each
 * match carries a rule id, 1-based line and excerpt the UI shows). It is a
 * best-effort tripwire, not a security boundary.
 *
 * Block rule: >= 1 `high` match OR >= 2 `medium` matches => `detected`.
 *
 * Tuning is the main risk: legitimate security skills discuss injection in the
 * THIRD person ("flag comments that say \"ignore previous instructions\""). So
 * the content rules (high) skip a hit that is quoted/backticked AND preceded by
 * a reporting cue ("flag", "such as", "e.g.", "phrases like", ...). The
 * seeded-skill regression test (`test/skill-injection.test.ts`) guards this.
 */

export interface InjectionScan {
  /** True when the block rule fired (>=1 high or >=2 medium). */
  detected: boolean;
  /** Every match found (also present when `detected` is false), sorted by line. */
  matches: InjectionMatch[];
}

/** High matches needed to block. */
const HIGH_THRESHOLD = 1;
/** Medium matches needed to block. */
const MEDIUM_THRESHOLD = 2;
/** Max characters of the source line kept as `excerpt`. */
const EXCERPT_MAX = 160;
/** Characters of context before a hit inspected for a "reporting cue". */
const CUE_WINDOW = 200;

interface Hit {
  index: number;
  end: number;
  /** Text shown as the excerpt instead of the source line (hidden chars). */
  excerpt?: string;
}

interface Rule {
  id: string;
  severity: InjectionMatch['severity'];
  /**
   * Skip hits that only *mention* the pattern: 'mention' = quoted AND introduced by a
   * reporting cue (content rules); 'inline-code' = inside a same-line `code span`
   * (documenting the `<untrusted>` wrapper etc.). Never applied to hidden chars / links.
   */
  exempt: 'mention' | 'inline-code' | false;
  find(body: string): Hit[];
}

/** Whitespace, including newlines: a hard-wrapped body must still match. */
const S = String.raw`\s+`;

function regexFinder(...patterns: RegExp[]): (body: string) => Hit[] {
  return (body) => {
    const hits: Hit[] = [];
    for (const re of patterns) {
      for (const m of body.matchAll(re)) {
        hits.push({ index: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
      }
    }
    return hits;
  };
}

// ---- high: content rules ---------------------------------------------------

const INSTRUCTION_OVERRIDE = regexFinder(
  new RegExp(
    String.raw`\b(?:ignore|disregard|forget|discard|bypass)${S}(?:(?:all|any|every|the|your|of|my)${S})*(?:previous|prior|above|earlier|preceding|original|system)${S}(?:instructions?|prompts?|rules?|directives?|guidelines?|context|messages?)`,
    'gi',
  ),
  new RegExp(
    String.raw`\b(?:ignore|disregard|forget)${S}(?:everything|anything|all)${S}(?:above|before|prior|you\s+(?:were|have\s+been)\s+told)`,
    'gi',
  ),
  new RegExp(
    String.raw`\boverride${S}(?:(?:all|any|the|your|every)${S})*(?:safety|security|previous|prior|system|content)${S}(?:guidelines?|instructions?|rules?|restrictions?|constraints?|protocols?|policies|filters?)`,
    'gi',
  ),
  new RegExp(
    String.raw`\b(?:do\s+not|don['’]t|never|must\s+not|mustn['’]t|no\s+longer)${S}follow${S}(?:(?:any|all|the|your)${S})*(?:previous|prior|above|earlier|safety)${S}(?:instructions?|rules?|guidelines?)`,
    'gi',
  ),
);

const NO_LIMITS = String.raw`(?:with\s+no|without(?:\s+any)?|no)${S}(?:restrictions?|limits?|limitations?|rules?|filters?|guidelines?|constraints?|ethics|morals)`;

const ROLE_HIJACK = regexFinder(
  new RegExp(
    String.raw`\byou\s+are\s+now${S}(?:no\s+longer|free\s+(?:from|of|to)|unrestricted|jailbroken|in\s+(?:developer|dan|god|admin|debug)\s+mode|dan\b)`,
    'gi',
  ),
  new RegExp(String.raw`\byou\s+are\s+now${S}(?:an?)${S}[^.\n]{0,60}?\b${NO_LIMITS}`, 'gi'),
  new RegExp(
    String.raw`\b(?:act|behave|respond|operate)${S}(?:as|like)${S}[^.\n]{0,60}?\b${NO_LIMITS}`,
    'gi',
  ),
  new RegExp(
    String.raw`\b(?:adopt|assume|take\s+on|switch\s+to)${S}(?:an?${S})?(?:new|different|alternate|alternative)${S}(?:persona|identity|role)\b`,
    'gi',
  ),
  /\bdo\s+anything\s+now\b/gi,
  /\b(?:DAN|jailbreak(?:ed)?|developer)\s+mode\s+(?:enabled|on|activated|engaged)\b/gi,
);

const PROMPT_EXFILTRATION = regexFinder(
  new RegExp(
    String.raw`\b(?:output|reveal|print|show|display|repeat|leak|dump|disclose|expose)${S}(?:me${S})?(?:(?:all|any|every|the|your|of|hidden|internal|secret|full|complete|entire)${S})*(?:system${S}(?:prompts?|messages?|instructions?)|agent${S}(?:configurations?|configs?|prompts?)|(?:initial|original|hidden)${S}(?:prompts?|instructions?)|instructions${S}you${S}(?:were|have${S}been)${S}given)`,
    'gi',
  ),
  new RegExp(
    String.raw`\b(?:reveal|leak|disclose|dump)${S}(?:(?:all|any|your|the|of|hidden|internal|secret)${S})*(?:instructions|prompts?)\b`,
    'gi',
  ),
);

const VERDICT_MANIPULATION = regexFinder(
  // "always give score 100", "Always return score: 100"
  new RegExp(
    String.raw`\balways${S}(?:give|return|output|set|assign|report|produce|use|respond${S}with)${S}(?:(?:a|the|an|perfect|maximum|max|full)${S})*(?:score|rating)\b[^\n.]{0,20}\b100\b`,
    'gi',
  ),
  // "always verdict approve", "always return the verdict: approve"
  new RegExp(
    String.raw`\b(?:must${S})?always${S}(?:(?:give|return|output|set|use|issue|respond${S}with)${S})?(?:(?:a|the)${S})?verdict\s*(?:of|is|[:=])?\s*["'“\x60]?(?:approve|approved|lgtm)\b`,
    'gi',
  ),
  // "always approve (all) PRs" / "Approve all PRs regardless" — but not "never approve all PRs".
  new RegExp(
    String.raw`(?<!(?:\bnot|\bnever|n['’]t)\s+)\b(?:always${S}approve|(?:approve|accept|lgtm)${S}(?:all|every|any))${S}(?:(?:the|of|incoming)${S})?(?:PRs?|pull${S}requests?|changes|diffs?|commits?|code)\b`,
    'gi',
  ),
  // "Never flag security issues", "Never mention security vulnerabilities"
  new RegExp(
    String.raw`\bnever${S}(?:flag|mention|report|raise|reveal|surface|warn${S}about|point${S}out|comment${S}on)${S}(?:(?:any|the|about|of|a)${S})*(?:security|vulnerabilit\w+|malicious|injection)\b`,
    'gi',
  ),
);

// ---- medium: structure / obfuscation rules ---------------------------------

const DELIMITER_SPOOF = regexFinder(
  // Line-leading role labels (uppercase only: lower-case "system:" is common prose).
  /^[ \t]*(?:SYSTEM|ASSISTANT|DEVELOPER)[ \t]*:/gm,
  // Chat-template / special tokens.
  /<\|(?:im_start|im_end|system|assistant|user|endoftext)\|>|\[\/?INST\]|<<\/?SYS>>/gi,
  // Closing/opening the untrusted wrapper or a system block.
  /<\/?(?:untrusted|system|instructions?)\b[^>\n]*>/gi,
  // Fake system headers.
  /^[ \t]{0,3}#{1,6}[ \t]*(?:new[ \t]+)?system(?:[ \t]+(?:prompt|message|instructions?))?[ \t]*$/gim,
);

/** Zero-width / bidi control characters. BOM at index 0 and emoji ZWJ are legit. */
const HIDDEN_CHARS =
  /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069]|(?<=[ -~])[\u200C\u200D](?=[ -~])|(?<!^)\uFEFF/gu;

const IMPERATIVE_IN_COMMENT =
  /\b(?:ignore|disregard|override|you\s+must|you\s+are\s+now|always\s+approve|never\s+flag|reveal|output\s+all|system\s+prompt|approve\s+all)\b/i;

function findHidden(body: string): Hit[] {
  const hits: Hit[] = [];
  for (const m of body.matchAll(HIDDEN_CHARS)) {
    const index = m.index ?? 0;
    const cp = (m[0].codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');
    hits.push({ index, end: index + m[0].length, excerpt: `hidden control character U+${cp}` });
  }
  for (const m of body.matchAll(/<!--([\s\S]*?)-->/g)) {
    if (IMPERATIVE_IN_COMMENT.test(m[1] ?? '')) {
      const index = m.index ?? 0;
      hits.push({ index, end: index + m[0].length });
    }
  }
  return hits;
}

const EXFIL_LINK = regexFinder(
  // Markdown image/link whose URL embeds a template placeholder.
  /!?\[[^\]\n]*\]\(\s*https?:\/\/[^)\s]*(?:\{\{|\$\{|%7B%7B|<[^>\s]+>|[?&][^)\s=]+=(?:\{|\$\{|%7B|%3C))[^)\n]*\)/gi,
  // Auto-fetched image whose query string carries data-shaped parameters.
  /!\[[^\]\n]*\]\(\s*https?:\/\/[^)\s]*[?&](?:data|payload|secret|token|apikey|api_key|prompt|leak|exfil|context|system)=[^)\s]*\)/gi,
);

const RULES: Rule[] = [
  { id: 'instruction-override', severity: 'high', exempt: 'mention', find: INSTRUCTION_OVERRIDE },
  { id: 'role-hijack', severity: 'high', exempt: 'mention', find: ROLE_HIJACK },
  { id: 'prompt-exfiltration', severity: 'high', exempt: 'mention', find: PROMPT_EXFILTRATION },
  { id: 'verdict-manipulation', severity: 'high', exempt: 'mention', find: VERDICT_MANIPULATION },
  { id: 'delimiter-spoof', severity: 'medium', exempt: 'inline-code', find: DELIMITER_SPOOF },
  { id: 'hidden-content', severity: 'medium', exempt: false, find: findHidden },
  { id: 'exfil-link', severity: 'medium', exempt: false, find: EXFIL_LINK },
];

/** Something a skill says when it is REPORTING on an attack phrase, not issuing it. */
const REPORTING_CUE =
  /\b(?:flag|detect|report|reject|block|look(?:s|ing)?\s+for|watch(?:es|ing)?\s+for|such\s+as|e\.g\.?|for\s+(?:example|instance)|phrases?|patterns?|strings?|text|comments?|messages?|attempts?|injection|says?|saying|contains?|containing|like|includes?|including)\b/i;

/**
 * True when the hit is a *mention*: wrapped in quotes/backticks AND introduced by
 * a reporting cue within the preceding window. Both are required so a bare
 * imperative ("Ignore all previous instructions.") is never exempt.
 */
function isMention(body: string, hit: Hit): boolean {
  const before = body.slice(Math.max(0, hit.index - CUE_WINDOW), hit.index);
  const after = body.slice(hit.end, hit.end + 4);
  const quotedBefore = /["'\x60“‘«]\s*$/.test(before);
  const quotedAfter = /^\s*["'\x60”’»]/.test(after);
  return quotedBefore && quotedAfter && REPORTING_CUE.test(before);
}

/** True when the hit sits inside a single-line `inline code span` (odd backtick count before it). */
function inInlineCode(body: string, hit: Hit): boolean {
  const lineStart = body.lastIndexOf('\n', hit.index - 1) + 1;
  const nextNl = body.indexOf('\n', hit.end);
  const lineEnd = nextNl === -1 ? body.length : nextNl;
  const before = body.slice(lineStart, hit.index).split('`').length - 1;
  const after = body.slice(hit.end, lineEnd).includes('`');
  return before % 2 === 1 && after;
}

/** Offsets at which each (1-based) line starts. */
function lineStarts(body: string): number[] {
  const starts = [0];
  for (let i = 0; i < body.length; i++) if (body[i] === '\n') starts.push(i + 1);
  return starts;
}

/** 0-based index of the line containing `offset` (binary search). */
function lineIndexOf(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function excerptFor(body: string, starts: number[], lineIdx: number, hit: Hit): string {
  if (hit.excerpt) return hit.excerpt;
  const lineStart = starts[lineIdx]!;
  const lineEnd = lineIdx + 1 < starts.length ? starts[lineIdx + 1]! - 1 : body.length;
  const line = body.slice(lineStart, lineEnd).replace(/\r$/, '');
  if (line.trim().length <= EXCERPT_MAX) return line.trim();
  // Long line (e.g. a whole paragraph on one line): window around the hit.
  const from = Math.max(0, hit.index - lineStart - 30);
  const slice = line.slice(from, from + EXCERPT_MAX).trim();
  return `${from > 0 ? '…' : ''}${slice}…`;
}

/**
 * Scan a skill body. Never throws; an empty body yields `{ detected: false, matches: [] }`.
 * Matches are de-duplicated per (rule, line) and sorted by line, then severity.
 */
export function detectInjection(body: string): InjectionScan {
  if (!body) return { detected: false, matches: [] };
  const starts = lineStarts(body);
  const seen = new Set<string>();
  const matches: InjectionMatch[] = [];

  for (const rule of RULES) {
    for (const hit of rule.find(body)) {
      if (rule.exempt === 'mention' && isMention(body, hit)) continue;
      if (rule.exempt === 'inline-code' && inInlineCode(body, hit)) continue;
      const lineIdx = lineIndexOf(starts, hit.index);
      const key = `${rule.id}:${lineIdx}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        rule: rule.id,
        severity: rule.severity,
        line: lineIdx + 1,
        excerpt: excerptFor(body, starts, lineIdx, hit),
      });
    }
  }

  matches.sort(
    (a, b) =>
      a.line - b.line ||
      (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1) ||
      a.rule.localeCompare(b.rule),
  );
  const high = matches.filter((m) => m.severity === 'high').length;
  const medium = matches.length - high;
  return { detected: high >= HIGH_THRESHOLD || medium >= MEDIUM_THRESHOLD, matches };
}
