// pr-self-review — shared finding helpers for units.mjs and verdict.mjs (no I/O except the readers).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];
const RANK = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

// Source skills use their own scales; map them onto the product enum (references/severity-rubric.md).
const ALIASES = {
  CRITICAL: 'CRITICAL', BLOCKER: 'CRITICAL',
  HIGH: 'WARNING', WARNING: 'WARNING', MEDIUM: 'WARNING', MAJOR: 'WARNING',
  LOW: 'SUGGESTION', MINOR: 'SUGGESTION', SUGGESTION: 'SUGGESTION', INFO: 'SUGGESTION', NIT: 'SUGGESTION',
};

export function normalizeSeverity(s, maxSeverity = 'CRITICAL') {
  const sev = ALIASES[String(s ?? '').trim().toUpperCase()] ?? 'SUGGESTION';
  return RANK[sev] < RANK[maxSeverity] ? maxSeverity : sev;
}

export const bySeverity = (a, b) => RANK[a.severity] - RANK[b.severity]
  || String(a.file ?? '').localeCompare(String(b.file ?? '')) || (a.line ?? 0) - (b.line ?? 0);

/** Stable id, so a waiver given for a finding survives re-running the review on the same diff. */
export function findingId({ source, skill, rule, file, line, title }) {
  const key = [source, skill ?? '', rule ?? '', file ?? '', line ?? '', String(title ?? '').trim().toLowerCase()].join('|');
  return `F-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 8)}`;
}

/** Normalize one raw reviewer finding. Unknown fields are dropped; missing ones get safe defaults. */
export function normalizeFinding(raw, { unit, skill, maxSeverity }) {
  const f = {
    source: 'review',
    unit,
    skill: raw.skill ?? skill,
    rule: String(raw.rule ?? '').trim() || 'unspecified',
    file: raw.file ? String(raw.file).replace(/^\.?\//, '') : null,
    line: Number.isInteger(raw.line) ? raw.line : (Number.parseInt(raw.line, 10) || null),
    severity: normalizeSeverity(raw.severity, maxSeverity),
    originalSeverity: raw.severity ?? null,
    title: String(raw.title ?? '').trim() || '(untitled finding)',
    evidence: String(raw.evidence ?? '').trim(),
    fix: String(raw.fix ?? '').trim(),
    introducedByDiff: raw.introducedByDiff !== false,
  };
  return { id: findingId(f), ...f };
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/**
 * Read every reviewer result in <run>/units/<id>.findings.json.
 * Returns { results: { [unitId]: {status, error?, count} }, findings: [...] }.
 */
export function readUnitResults(run, unitsJson) {
  const results = {};
  const findings = [];
  for (const u of unitsJson?.selected ?? []) {
    const p = path.join(run, 'units', `${u.id}.findings.json`);
    if (!fs.existsSync(p)) { results[u.id] = { status: 'missing' }; continue; }
    let data;
    try { data = readJson(p); } catch (e) { results[u.id] = { status: 'invalid', error: e.message }; continue; }
    if (!Array.isArray(data.findings)) { results[u.id] = { status: 'invalid', error: 'no findings array' }; continue; }
    const status = data.status === 'done' ? 'done' : (data.status ?? 'done');
    results[u.id] = { status, count: data.findings.length, ...(data.error ? { error: String(data.error) } : {}) };
    for (const raw of data.findings) {
      findings.push(normalizeFinding(raw, { unit: u.id, skill: u.skill, maxSeverity: u.maxSeverity }));
    }
  }
  return { results, findings };
}

/** Verifier answers in <run>/verify/<findingId>.json → Map(id → {decision, reason}). */
export function readVerifications(run) {
  const dir = path.join(run, 'verify');
  const res = new Map();
  if (!fs.existsSync(dir)) return res;
  for (const name of fs.readdirSync(dir).filter((n) => /^F-[0-9a-f]{8}\.json$/.test(n))) {
    try {
      const v = readJson(path.join(dir, name));
      const decision = String(v.decision ?? '').toLowerCase();
      if (['confirmed', 'downgrade', 'reject'].includes(decision)) {
        res.set(name.slice(0, -5), { decision, reason: String(v.reason ?? '').trim() });
      }
    } catch { /* an unreadable answer counts as no answer → the CRITICAL stays blocking */ }
  }
  return res;
}
