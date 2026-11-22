#!/usr/bin/env node
// Deterministic checks for INSIGHTS.md files (judgment stays in SKILL.md; mechanics live here).
//
//   node .claude/skills/engineering-insights/scripts/insights.mjs stats   entries per section; OVER when a file needs consolidation
//   node .claude/skills/engineering-insights/scripts/insights.mjs lint    format errors (exit 1) + warnings: line numbers, dead paths, missing evidence
//   node …/insights.mjs append <module> "<Section>" "<entry>"     THE ONLY WAY TO ADD: inserts at the end of the section, never rewrites
//   node …/insights.mjs supersede <module> "<unique substring>"   the only allowed change to an old entry: prefix "[SUPERSEDED] "
//   node …/insights.mjs verify                                    every line committed in git HEAD is still present (exit 1 if not)
//
// <module> = server | client | reviewer-core | e2e | root   (root → repo-level INSIGHTS.md)
// Safety: append/supersede re-read the file, write, re-read, and prove that the old content is intact
// (old lines are an in-order subsequence of the new file); on any mismatch the original bytes are restored.
//
// Limits (env-overridable): MAX_ENTRIES=50 per file, MAX_SESSION_NOTES=10.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname, relative } from "node:path";

const SECTIONS = ["What Works", "What Doesn't Work", "Codebase Patterns", "Tool & Library Notes",
  "Recurring Errors & Fixes", "Session Notes", "Open Questions"];
const EVIDENCE_OPTIONAL = new Set(["Session Notes", "Open Questions"]);
const MAX_ENTRIES = Number(process.env.MAX_ENTRIES || 50);
const MAX_NOTES = Number(process.env.MAX_SESSION_NOTES || 10);

let root;
try { root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim(); }
catch { root = process.cwd(); }

const files = ["INSIGHTS.md", "server/INSIGHTS.md", "client/INSIGHTS.md", "reviewer-core/INSIGHTS.md", "e2e/INSIGHTS.md"]
  .map((f) => join(root, f)).filter(existsSync);

// Parse into entries: { section, startLine, lines[] }. Continuation lines are indented.
function parse(file) {
  const text = readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ""));
  const entries = []; const problems = []; let section = null; let cur = null;
  text.split("\n").forEach((line, i) => {
    const n = i + 1;
    if (line.startsWith("## ")) {
      section = line.slice(3).trim(); cur = null;
      if (!SECTIONS.includes(section)) problems.push({ level: "ERROR", n, msg: `unknown section "${section}" (allowed: ${SECTIONS.join(" | ")})` });
      return;
    }
    if (!section || !line.trim()) { cur = null; return; }
    if (line.startsWith("- ")) { cur = { section, startLine: n, lines: [line] }; entries.push(cur); return; }
    if (/^\s+\S/.test(line) && cur) { cur.lines.push(line.trim()); return; }
    problems.push({ level: "ERROR", n, msg: "stray text inside a section (entries must start with '- ')" });
  });
  return { entries, problems };
}

function lintEntry(e, file) {
  const out = []; const text = e.lines.join(" "); const n = e.startLine;
  const body = text.replace(/^- (\[SUPERSEDED\] )?/, "");
  if (!/^\d{4}-\d{2}-\d{2} · /.test(body)) out.push({ level: "ERROR", n, msg: "entry must start with 'YYYY-MM-DD · '" });
  if (e.lines.length > 2) out.push({ level: "ERROR", n, msg: `entry is ${e.lines.length} lines (max 2) — it is documentation, not an insight` });
  const parts = body.split(" · ").length;
  const minParts = EVIDENCE_OPTIONAL.has(e.section) ? 2 : 3;
  if (parts < minParts) out.push({ level: "ERROR", n, msg: `expected 'date · trigger · rule${EVIDENCE_OPTIONAL.has(e.section) ? "" : " · evidence"}' (found ${parts} parts)` });
  const ticks = [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  if (!EVIDENCE_OPTIONAL.has(e.section) && !ticks.length) out.push({ level: "WARN", n, msg: "no `evidence` (path + symbol, command or exact error text)" });
  for (const t of ticks) {
    if (/\.[a-z]{1,5}:\d+/i.test(t)) out.push({ level: "WARN", n, msg: `line number in \`${t}\` — line numbers rot; use path + symbol` });
    const path = t.replace(/:\d+.*$/, "").replace(/#.*$/, "");
    const looksLikePath = /^[\w.@-]+(\/[\w.@\[\]-]+)+\/?$/.test(path) && !/^https?:/.test(path);
    if (looksLikePath && !/\*/.test(path)) {
      const fromRoot = join(root, path); const fromModule = join(dirname(file), path);
      if (!existsSync(fromRoot) && !existsSync(fromModule)) out.push({ level: "WARN", n, msg: `path \`${path}\` does not exist — stale entry?` });
    }
  }
  return out;
}

const MODULES = { root: "INSIGHTS.md", server: "server/INSIGHTS.md", client: "client/INSIGHTS.md",
  "reviewer-core": "reviewer-core/INSIGHTS.md", e2e: "e2e/INSIGHTS.md" };
const TEMPLATE = join(dirname(new URL(import.meta.url).pathname), "..", "assets", "INSIGHTS.template.md");
const fail = (msg) => { console.error(`REFUSED: ${msg}`); process.exit(1); };
const norm = (s) => s.replace(/^- (\[SUPERSEDED\] )?\d{4}-\d{2}-\d{2} · /, "").replace(/\s+/g, " ").trim().toLowerCase();

// true if every line of `oldLines` appears in `newLines` in the same order (extra lines allowed in between).
// `allowPrefix` lets exactly one old line reappear with "[SUPERSEDED] " inserted after "- ".
function isPreserved(oldLines, newLines, allowPrefix = null) {
  let j = 0;
  for (const line of oldLines) {
    const alt = allowPrefix !== null && line === allowPrefix ? line.replace(/^- /, "- [SUPERSEDED] ") : null;
    while (j < newLines.length && newLines[j] !== line && newLines[j] !== alt) j++;
    if (j === newLines.length) return false;
    j++;
  }
  return true;
}

// Write atomically (temp + rename), re-read, prove preservation; restore original on failure.
function safeWrite(file, before, after, check) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, after); renameSync(tmp, file);
  const reread = readFileSync(file, "utf8");
  if (reread !== after || !check(before.split("\n"), reread.split("\n"))) {
    writeFileSync(file, before);
    fail("post-write verification failed — original content restored, nothing changed");
  }
}

function resolveModule(mod) {
  if (!MODULES[mod]) fail(`unknown module "${mod}" (use: ${Object.keys(MODULES).join(" | ")})`);
  return join(root, MODULES[mod]);
}

function cmdAppend(mod, section, entry) {
  if (!SECTIONS.includes(section)) fail(`unknown section "${section}" (allowed: ${SECTIONS.join(" | ")})`);
  if (!entry) fail("empty entry");
  const file = resolveModule(mod);
  let before;
  if (existsSync(file)) before = readFileSync(file, "utf8");
  else { // create from template — only ever when the file does not exist
    before = readFileSync(TEMPLATE, "utf8").replace("<module>", mod === "root" ? "repo root" : mod);
    writeFileSync(file, before, { flag: "wx" }); // wx: fails if the file appeared meanwhile — never clobbers
  }
  // normalise the entry: "- " prefix, continuation lines indented by 2
  const entryLines = entry.trim().split("\n").map((l, i) => (i === 0 ? (l.startsWith("- ") ? l : `- ${l}`) : `  ${l.trim()}`));
  const problems = lintEntry({ section, startLine: 0, lines: entryLines.map((l, i) => (i ? `  ${l.trim()}` : l)) }, file)
    .filter((p) => p.level === "ERROR");
  if (problems.length) fail(problems.map((p) => p.msg).join("; "));

  const { entries } = parse(file);
  const dup = entries.find((e) => norm(e.lines.join(" ")) === norm(entryLines.join(" ")));
  if (dup) fail(`identical entry already exists at ${relative(root, file)}:${dup.startLine}`);

  const lines = before.split("\n");
  const h = lines.findIndex((l) => l.trim() === `## ${section}`);
  if (h === -1) fail(`section "## ${section}" not found in ${relative(root, file)} — add it by hand from the template`);
  let end = lines.findIndex((l, i) => i > h && l.startsWith("## "));
  if (end === -1) end = lines.length;
  let insertAt = end; // after the last non-blank line of the section
  while (insertAt > h + 1 && !lines[insertAt - 1].trim()) insertAt--;
  const next = [...lines.slice(0, insertAt), ...entryLines, ...lines.slice(insertAt)];
  const after = next.join("\n");

  safeWrite(file, before, after, (o, n) => isPreserved(o, n) && n.length === o.length + entryLines.length);
  console.log(`APPENDED ${relative(root, file)} → ${section} (line ${insertAt + 1}); ${lines.length} existing lines preserved`);
}

function cmdSupersede(mod, needle) {
  if (!needle || needle.length < 8) fail("give a unique substring of the old entry (≥ 8 chars)");
  const file = resolveModule(mod);
  if (!existsSync(file)) fail(`${relative(root, file)} does not exist`);
  const before = readFileSync(file, "utf8");
  const lines = before.split("\n");
  const hits = lines.map((l, i) => [l, i]).filter(([l]) => /^- \d{4}-\d{2}-\d{2} · /.test(l) && l.includes(needle));
  if (hits.length !== 1) fail(`substring must match exactly one active entry's first line (matched ${hits.length})`);
  const [line, idx] = hits[0];
  const next = [...lines]; next[idx] = line.replace(/^- /, "- [SUPERSEDED] ");
  safeWrite(file, before, next.join("\n"), (o, n) => n.length === o.length && isPreserved(o, n, line));
  console.log(`SUPERSEDED ${relative(root, file)}:${idx + 1}`);
}

function cmdVerify() {
  let bad = 0; let checked = 0;
  for (const rel of Object.values(MODULES)) {
    let head;
    try { head = execFileSync("git", ["show", `HEAD:${rel}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
    catch { console.log(`skip  ${rel} (not committed yet — nothing to compare against)`); continue; }
    checked++;
    const file = join(root, rel);
    if (!existsSync(file)) { console.log(`FAIL  ${rel} was deleted`); bad++; continue; }
    const now = readFileSync(file, "utf8").split("\n");
    const supersededOk = (l) => now.includes(l) || now.includes(l.replace(/^- /, "- [SUPERSEDED] "));
    const lost = head.split("\n").filter((l) => l.trim() && !supersededOk(l));
    if (lost.length) { bad++; console.log(`FAIL  ${rel}: ${lost.length} committed line(s) removed or changed:`); lost.forEach((l) => console.log(`        - ${l}`)); }
    else console.log(`ok    ${rel}`);
  }
  console.log(`verify: ${bad} file(s) with lost content, ${checked} compared to HEAD`);
  process.exit(bad ? 1 : 0);
}

const mode = process.argv[2];
if (mode === "append") cmdAppend(process.argv[3], process.argv[4], process.argv[5]);
else if (mode === "supersede") cmdSupersede(process.argv[3], process.argv[4]);
else if (mode === "verify") cmdVerify();
else if (mode === "stats") {
  let over = false;
  for (const f of files) {
    const { entries } = parse(f);
    const by = {}; let sup = 0;
    for (const e of entries) { by[e.section] = (by[e.section] || 0) + 1; if (/^- \[SUPERSEDED\]/.test(e.lines[0])) sup++; }
    const flag = entries.length > MAX_ENTRIES || (by["Session Notes"] || 0) > MAX_NOTES ? "OVER" : "ok";
    if (flag === "OVER") over = true;
    const detail = SECTIONS.filter((s) => by[s]).map((s) => `${s}=${by[s]}`).join("  ");
    console.log(`${flag.padEnd(4)} ${relative(root, f).padEnd(26)} ${String(entries.length).padStart(3)} entries (${sup} superseded)  ${detail}`);
  }
  if (over) console.log(`→ OVER (>${MAX_ENTRIES} entries or >${MAX_NOTES} Session Notes): offer the user a review-mode consolidation.`);
} else if (mode === "lint") {
  let errors = 0; let warns = 0;
  for (const f of files) {
    const { entries, problems } = parse(f);
    const all = [...problems, ...entries.flatMap((e) => lintEntry(e, f))].sort((a, b) => a.n - b.n);
    for (const p of all) {
      console.log(`${p.level.padEnd(5)} ${relative(root, f)}:${p.n}  ${p.msg}`);
      p.level === "ERROR" ? errors++ : warns++;
    }
  }
  console.log(`lint: ${errors} error(s), ${warns} warning(s) in ${files.length} file(s)`);
  process.exit(errors ? 1 : 0);
} else {
  console.error("usage: insights.mjs stats | lint | verify | append <module> <section> <entry> | supersede <module> <substring>");
  process.exit(2);
}
