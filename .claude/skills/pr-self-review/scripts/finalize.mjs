#!/usr/bin/env node
// Steps 5–7: turn reviewer output into a verdict.
//
//   node finalize.mjs --run <RUN_DIR> --stage candidates
//       Grounds + filters findings, writes candidates.json (fresh criticals that
//       need an adversarial verifier). Prints their ids and verify paths.
//   node finalize.mjs --run <RUN_DIR> [--quick] [--waive <id>=<reason> ...]
//       Applies verifications, suppressions, dedup and waivers, writes the cache,
//       report.md, pr-body-section.md and the verdict the gate reads.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SEVERITIES, SKILL_DIR, findingId, matchesAny, normalize, parseArgs, readJson,
  stateDir, verdictPath, writeJson,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (typeof args.run !== "string") throw new Error("Usage: finalize.mjs --run <RUN_DIR> [--stage candidates]");
const runDir = args.run;
const manifest = readJson(join(runDir, "manifest.json"));
const facts = readJson(join(runDir, "files.json"));
const routing = readJson(join(SKILL_DIR, "routing.json"));
const root = manifest.root;
const state = stateDir(root);
const quick = Boolean(args.quick);
const rank = (s) => SEVERITIES.indexOf(s);
const precedence = (s) => {
  const i = routing.precedence.indexOf(s);
  return i === -1 ? routing.precedence.length : i;
};
const fileLines = new Map();
const linesOf = (p) => {
  if (!fileLines.has(p)) {
    const abs = join(root, p);
    fileLines.set(p, existsSync(abs) ? readFileSync(abs, "utf8").split("\n") : []);
  }
  return fileLines.get(p);
};

// ---------------------------------------------------------------- collect
const incomplete = [];
const dropped = [];
const fresh = []; // grounded findings from reviewers that ran in this run
const cached = []; // findings replayed from cache (already grounded + verified)
const reviewedFresh = new Map(); // groupId -> files actually reviewed this run

for (const g of manifest.groups) {
  for (const c of g.cachedFiles) {
    const entry = readJson(join(state, "cache", `${c.cacheKey}.json`), null);
    if (entry) cached.push(...entry.findings.map((f) => ({ ...f, cached: true })));
  }
  if (g.files.length === 0 || quick) continue;
  const out = readJson(g.outputPath, null);
  if (!out || !Array.isArray(out.findings)) {
    incomplete.push(g.id);
    continue;
  }
  const inGroup = new Set(g.files.map((f) => f.path));
  reviewedFresh.set(g.id, g);
  for (const raw of out.findings) {
    const f = normalizeFinding(raw, g.skill);
    if (!inGroup.has(f.file)) {
      dropped.push({ ...f, dropReason: "file not in this reviewer's group" });
      continue;
    }
    const grounded = ground(f);
    if (grounded.dropReason) dropped.push(grounded);
    else fresh.push(grounded);
  }
}

const checks = readJson(join(runDir, "checks.json"), null);
if (!checks) incomplete.push("checks (checks.mjs did not run)");
const ruleFindings = (checks?.findings ?? []).map((f) => ({ ...f, id: findingId(f), deterministic: true }));

// ------------------------------------------------------------- candidates
if (args.stage === "candidates") {
  const candidates = fresh.filter((f) => f.severity === "critical");
  writeJson(join(runDir, "candidates.json"), candidates);
  console.log(`Grounded findings: ${fresh.length} fresh, ${cached.length} cached, ${dropped.length} dropped as ungrounded.`);
  if (incomplete.length) console.log(`INCOMPLETE groups (no valid output): ${incomplete.join(", ")}`);
  console.log(`Critical candidates needing verification: ${candidates.length}`);
  for (const c of candidates) {
    console.log(`  ${c.id}  ${c.file}:${c.line}  [${c.source}] ${c.rule} — ${c.title}`);
    console.log(`        verify output: ${join(runDir, "verify", `${c.id}.json`)}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------- verification
for (const f of fresh) {
  if (f.severity !== "critical") continue;
  const v = readJson(join(runDir, "verify", `${f.id}.json`), null);
  if (!v) f.notes.push("not verified — kept as critical (fail-safe)");
  else if (v.verdict === "refuted") {
    f.severity = "major";
    f.notes.push(`downgraded from critical by verifier: ${v.reason ?? "refuted"}`);
  } else f.notes.push(`verified: ${v.reason ?? "confirmed"}`);
}

// ------------------------------------------------------------------ cache
for (const g of reviewedFresh.values()) {
  for (const file of g.files) {
    const own = fresh.filter((f) => f.source === g.skill && f.file === file.path);
    writeJson(join(state, "cache", `${file.cacheKey}.json`), { skill: g.skill, file: file.path, createdAt: new Date().toISOString(), findings: own });
  }
}

// ----------------------------------------------------------- suppressions
const suppressionsFile = readJson(join(SKILL_DIR, "suppressions.json"), { suppressions: [] });
const today = new Date().toISOString().slice(0, 10);
const activeSuppressions = suppressionsFile.suppressions.filter((s) => !s.expires || s.expires >= today);
const suppressed = [];
const all = [...ruleFindings, ...fresh, ...cached].filter((f) => {
  const why = suppressionFor(f);
  if (why) suppressed.push({ ...f, suppressedBy: why });
  return !why;
});

// ------------------------------------------------------------------ dedup
const byLocation = new Map();
for (const f of all.sort((a, b) => rank(a.severity) - rank(b.severity) || precedence(a.source) - precedence(b.source))) {
  const key = `${f.file}:${f.line}`;
  const primary = byLocation.get(key);
  if (!primary) byLocation.set(key, { ...f, alsoReportedBy: [] });
  else primary.alsoReportedBy.push({ source: f.source, severity: f.severity, rule: f.rule, title: f.title });
}
const final = [...byLocation.values()];

// ---------------------------------------------------------------- waivers
const waiverArgs = [].concat(args.waive ?? []).filter((w) => typeof w === "string");
const waiverWarnings = [];
for (const w of waiverArgs) {
  const [id, reason] = w.split(/=(.*)/s);
  const target = final.find((f) => f.id === id && f.severity === "critical");
  if (!target) waiverWarnings.push(`waiver "${id}" matches no critical finding — ignored`);
  else if (!reason || reason.trim().length < 10) waiverWarnings.push(`waiver "${id}" needs a real reason (≥10 chars) — ignored`);
  else target.waived = reason.trim();
}

// ---------------------------------------------------------------- verdict
const criticals = final.filter((f) => f.severity === "critical");
const blocking = criticals.filter((f) => !f.waived);
const status = blocking.length || incomplete.length ? "block" : quick ? "quick-pass" : "pass";
const counts = Object.fromEntries(SEVERITIES.map((s) => [s, final.filter((f) => f.severity === s).length]));
const verdict = {
  fingerprint: manifest.fingerprint,
  status,
  mode: quick ? "quick" : "full",
  base: manifest.base,
  mergeBase: manifest.mergeBase,
  head: manifest.head,
  createdAt: new Date().toISOString(),
  counts,
  criticals: criticals.map(({ id, file, line, rule, title, source, waived }) => ({ id, file, line, rule, title, source, waived: waived ?? null })),
  incomplete,
  reportPath: join(runDir, "report.md"),
};
writeJson(verdictPath(state, manifest.fingerprint), verdict);
writeJson(join(runDir, "findings.final.json"), { verdict, findings: final, dropped, suppressed });

const report = renderReport();
writeFileSync(join(runDir, "report.md"), report);
writeFileSync(join(runDir, "pr-body-section.md"), renderPrSection());
console.log(report);
console.log(`\nVERDICT=${status.toUpperCase()}  REPORT=${join(runDir, "report.md")}`);

// =========================================================================
function normalizeFinding(raw, skill) {
  const sevMap = { high: "major", medium: "minor", low: "nit", blocker: "critical", error: "major", warning: "minor" };
  let severity = String(raw.severity ?? "minor").toLowerCase();
  severity = SEVERITIES.includes(severity) ? severity : sevMap[severity] ?? "minor";
  const f = {
    source: skill,
    severity,
    file: String(raw.file ?? "").replace(/^\.\//, ""),
    line: Number.parseInt(raw.line, 10) || 1,
    side: raw.side === "removed" ? "removed" : "added",
    rule: String(raw.rule ?? `${skill}/unspecified`),
    title: String(raw.title ?? "").trim(),
    evidence: String(raw.evidence ?? ""),
    why: String(raw.why ?? ""),
    fix: String(raw.fix ?? ""),
    notes: [],
  };
  f.id = findingId(f);
  return f;
}

/** Grounding gate: the quote must exist in the code; findings are re-anchored to the real line. */
function ground(f) {
  const quote = f.evidence.split("\n").map(normalize).find((l) => l.length >= 4);
  if (!quote) return { ...f, dropReason: "no evidence quote" };
  const fileFacts = facts[f.file];
  if (f.side === "removed") {
    return fileFacts?.removedText.some((t) => normalize(t).includes(quote))
      ? f
      : { ...f, dropReason: "quoted removed line not found in diff" };
  }
  const lines = linesOf(f.file);
  let best = -1;
  lines.forEach((l, i) => {
    if (normalize(l).includes(quote) && (best === -1 || Math.abs(i + 1 - f.line) < Math.abs(best + 1 - f.line))) best = i;
  });
  if (best === -1) return { ...f, dropReason: "evidence quote not found in file" };
  const line = best + 1;
  if (line !== f.line) f.notes.push(`re-anchored from line ${f.line}`);
  const isNew = fileFacts?.added.includes(line);
  if (!isNew) {
    f.notes.push(`pre-existing (line ${line} not changed in this diff) — was ${f.severity}`);
    return { ...f, line, severity: "info", preExisting: true };
  }
  return { ...f, line };
}

function suppressionFor(f) {
  if (f.severity === "critical") return null; // criticals are only waived explicitly, never suppressed
  const lines = linesOf(f.file);
  for (let i = Math.max(0, f.line - 3); i < Math.min(lines.length, f.line); i++) {
    const m = /self-review-ignore[:\s]+([\w@/.*-]+)/.exec(lines[i]);
    if (m && (m[1] === f.rule || m[1] === f.source || m[1] === "*")) return `inline comment line ${i + 1}`;
  }
  const s = activeSuppressions.find(
    (s) => (!s.rule || s.rule === f.rule) && (!s.source || s.source === f.source) && (!s.path || matchesAny(f.file, [].concat(s.path))),
  );
  return s ? `suppressions.json: ${s.reason}` : null;
}

function renderFinding(f) {
  const out = [`- **\`${f.id}\`** \`${f.file}:${f.line}\` · ${f.source} · \`${f.rule}\`${f.waived ? " · **WAIVED**" : ""}`];
  if (f.title) out.push(`  **${f.title}**`);
  if (f.evidence) out.push(`  > ${f.evidence.split("\n")[0].trim().slice(0, 200)}`);
  if (f.why) out.push(`  Why: ${f.why.replace(/\n+/g, " ").slice(0, 600)}`);
  if (f.fix) out.push(`  Fix: ${f.fix.replace(/\n+/g, " ").slice(0, 400)}`);
  if (f.waived) out.push(`  Waiver reason: ${f.waived}`);
  for (const n of f.notes ?? []) out.push(`  _${n}_`);
  for (const a of f.alsoReportedBy ?? []) out.push(`  _also: ${a.source} (${a.severity}) ${a.title}_`);
  return out.join("\n");
}

function renderReport() {
  const r = [];
  const icon = { block: "BLOCK", pass: "PASS", "quick-pass": "QUICK PASS (does not unlock PR)" }[status];
  r.push(`# PR self-review — ${icon}`);
  r.push("");
  r.push(`fingerprint \`${manifest.fingerprint}\` · base \`${manifest.base}\` · HEAD \`${manifest.head.slice(0, 8)}\` · ${verdict.mode} · ${verdict.createdAt}`);
  r.push("");
  r.push(`critical **${counts.critical}** (blocking ${blocking.length}) · major ${counts.major} · minor ${counts.minor} · nit ${counts.nit} · pre-existing ${counts.info}`);
  if (incomplete.length) r.push(`\n**Incomplete — verdict cannot pass:** ${incomplete.join(", ")}`);
  for (const sev of ["critical", "major", "minor", "nit"]) {
    const list = final.filter((f) => f.severity === sev);
    if (!list.length) continue;
    r.push(`\n## ${sev[0].toUpperCase()}${sev.slice(1)} (${list.length})\n`);
    r.push(list.map(renderFinding).join("\n"));
  }
  const pre = final.filter((f) => f.severity === "info");
  if (pre.length) {
    r.push(`\n## Pre-existing in touched files (${pre.length}, never blocking)\n`);
    r.push(pre.map((f) => `- \`${f.file}:${f.line}\` · ${f.source} · ${f.title}`).join("\n"));
  }
  r.push("\n## Deterministic checks\n");
  if (!checks?.commands?.length) r.push("- no package commands ran");
  for (const c of checks?.commands ?? []) r.push(`- ${c.ok === true ? "PASS" : c.ok === false ? "FAIL" : "SKIP"} ${c.name} (\`${c.cmd}\`)${c.skipped ? ` — ${c.skipped}` : ""}`);
  r.push("\n## Coverage\n");
  r.push("| reviewer | fresh files | cached files |");
  r.push("|---|---|---|");
  const cov = new Map();
  for (const g of manifest.groups) {
    const c = cov.get(g.skill) ?? { fresh: 0, cached: 0 };
    c.fresh += quick ? 0 : g.files.length;
    c.cached += g.cachedFiles.length;
    cov.set(g.skill, c);
  }
  for (const [s, c] of cov) r.push(`| ${s} | ${c.fresh} | ${c.cached} |`);
  if (manifest.unrouted.length) r.push(`\nNot reviewed by any skill: ${manifest.unrouted.map((p) => `\`${p}\``).join(", ")}`);
  for (const w of [...manifest.warnings, ...waiverWarnings]) r.push(`\n> WARN ${w}`);
  if (dropped.length || suppressed.length) {
    r.push(`\n## Filtered out\n`);
    for (const d of dropped) r.push(`- dropped (${d.dropReason}): ${d.source} \`${d.file}:${d.line}\` ${d.title}`);
    for (const s of suppressed) r.push(`- suppressed (${s.suppressedBy}): ${s.source} \`${s.file}:${s.line}\` ${s.title}`);
  }
  return r.join("\n");
}

function renderPrSection() {
  const r = ["## Self-review", ""];
  r.push(`\`/pr-self-review\` **${status.toUpperCase()}** on fingerprint \`${manifest.fingerprint}\` — critical ${counts.critical}, major ${counts.major}, minor ${counts.minor}.`);
  r.push(`Reviewers: ${[...new Set(manifest.groups.map((g) => g.skill))].join(", ") || "none"}; checks: ${(checks?.commands ?? []).map((c) => `${c.name} ${c.ok ? "✓" : c.ok === false ? "✗" : "–"}`).join(", ") || "none"}.`);
  const waived = criticals.filter((f) => f.waived);
  if (waived.length) {
    r.push("", "**Waived criticals:**");
    for (const f of waived) r.push(`- \`${f.file}:${f.line}\` ${f.title} — ${f.waived}`);
  }
  const majors = final.filter((f) => f.severity === "major");
  if (majors.length) {
    r.push("", "**Open majors:**");
    for (const f of majors) r.push(`- \`${f.file}:${f.line}\` ${f.title}`);
  }
  return `${r.join("\n")}\n`;
}
