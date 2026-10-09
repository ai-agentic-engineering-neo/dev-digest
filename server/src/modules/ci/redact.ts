/**
 * specs/14-export-to-ci.md (P2/P4, security-critical) — one shared guard
 * used in BOTH directions: P2 (`bundle.ts`) asserts generated file contents
 * are clean before they are ever written (AC-15/AC-55); P4 (`ingest.ts`)
 * asserts an ingested document contains no secret-shaped value before any
 * field is persisted (AC-63). Pure: no DB, no HTTP, no LLM.
 */

// Same shapes `.claude/skills/pr-self-review/SKILL.md`'s own secret-shape
// check lists: `sk-`, `ghp_`, `github_pat_`, `AKIA`, a PEM private-key
// header, and a long base64/hex value assigned to a key/token/secret-named
// field.
const SECRET_SHAPE_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9]{16,}\b/, // OpenAI/OpenRouter-style API keys
  /\bghp_[A-Za-z0-9]{36,}\b/, // GitHub personal access token (classic)
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, // GitHub fine-grained PAT
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private key header
  // A long base64/hex-ish blob assigned to a key/token/secret-named field —
  // `key: "AbCdEf0123456789...=="`, `token=...`, `secret_value: ...`.
  /(?:key|token|secret)\s*[:=]\s*["']?[A-Za-z0-9+/_-]{24,}={0,2}["']?/i,
];

/** AC-15/AC-55/AC-63 — true if `text` contains any credential-shaped value.
 *  Defence in depth: independent of any upstream guarantee (the runner's
 *  own, or `SecretsProvider`'s) not to emit one. Never logs or returns the
 *  matched value itself. */
export function containsSecretShapedValue(text: string): boolean {
  return SECRET_SHAPE_PATTERNS.some((re) => re.test(text));
}

/** True if `text` contains any of the caller's KNOWN secret values verbatim
 *  (e.g. the workspace's configured `OPENROUTER_API_KEY`) — a stronger,
 *  values-based check layered on top of the shape-based one above. Empty/
 *  blank candidate values are skipped (never treated as a universal match). */
export function containsKnownSecretValue(text: string, values: readonly (string | undefined)[]): boolean {
  return values.some((v) => typeof v === 'string' && v.trim().length > 0 && text.includes(v));
}

/** Scan an arbitrary JSON-shaped value's string fields recursively — used by
 *  both P2 (a generated `CiFile[]`) and P4 (a parsed ingest document) so
 *  neither has to hand-roll its own tree walk. */
export function findSecretShapedString(value: unknown): string | null {
  if (typeof value === 'string') {
    return containsSecretShapedValue(value) ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findSecretShapedString(item);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const hit = findSecretShapedString(v);
      if (hit) return hit;
    }
  }
  return null;
}
