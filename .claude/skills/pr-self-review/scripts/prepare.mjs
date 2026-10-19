#!/usr/bin/env node
// Step 1: collect every local change, fingerprint it, route files to skills,
// split into reviewer groups, and skip files whose review is cached.
//
//   node prepare.mjs [--base <branch>] [--no-cache]
//
// Writes <state>/runs/<fingerprint>/{manifest.json,files.json,groups/*.diff}
// and prints a summary ending with RUN_DIR=<path>.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  SKILL_DIR, changedFiles, fileDiff, fingerprint, git, matchesAny, parseArgs, parseDiff,
  readJson, repoRoot, resolveBase, sha256, stateDir, toRanges, writeJson,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const root = repoRoot();
const state = stateDir(root);
const routing = readJson(join(SKILL_DIR, "routing.json"));
const { base, mergeBase } = resolveBase(root, typeof args.base === "string" ? args.base : undefined);
const head = git(["rev-parse", "HEAD"], { cwd: root }).trim();

const files = changedFiles(root, mergeBase);
const fp = fingerprint(root, mergeBase, files);
const runDir = join(state, "runs", fp);
rmSync(runDir, { recursive: true, force: true });
mkdirSync(join(runDir, "groups"), { recursive: true });
mkdirSync(join(runDir, "findings"), { recursive: true });
mkdirSync(join(runDir, "verify"), { recursive: true });

// ---- per-file diff facts (used by reviewers and by finalize's grounding) ----
const fileFacts = {};
for (const f of files) {
  const excluded = matchesAny(f.path, routing.exclude);
  const diff = f.status === "D" || excluded ? "" : fileDiff(root, mergeBase, f);
  const { added, addedText, removedText } = parseDiff(diff);
  fileFacts[f.path] = { ...f, excluded, added, addedText, removedText, diffHash: sha256(diff), diff };
}

// ---- which skills exist, and which of them review code ----
const skillsDir = join(root, ".claude", "skills");
const installed = readdirSync(skillsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(skillsDir, d.name, "SKILL.md")))
  .map((d) => d.name);
const catalogScope = parseCatalogScopes(join(skillsDir, "README.md"));
const routes = routing.routes.filter((r) => r.skill.startsWith("@") || installed.includes(r.skill));
const warnings = [];
for (const r of routing.routes) {
  if (!r.skill.startsWith("@") && !installed.includes(r.skill)) warnings.push(`routing.json names "${r.skill}" but .claude/skills/${r.skill}/SKILL.md does not exist — route ignored.`);
}
const routed = new Set(routing.routes.map((r) => r.skill));
const unmappedSkills = installed.filter((s) => !routed.has(s) && !routing.notReviewers.includes(s));
for (const s of unmappedSkills) {
  const scope = catalogScope[s];
  const globs = scope && routing.scopeDefaults[scope];
  if (globs) {
    routes.push({ skill: s, include: globs, viaScopeDefault: scope });
    warnings.push(`Skill "${s}" is not in routing.json; using the ${scope} default globs. Add an explicit route.`);
  } else {
    warnings.push(`Skill "${s}" is not in routing.json and has no catalog scope — it reviews nothing. Add a route or list it in notReviewers.`);
  }
}

// ---- route files to skills ----
const bySkill = new Map();
const reviewable = files.filter((f) => f.status !== "D" && !fileFacts[f.path].excluded);
const unrouted = [];
for (const f of reviewable) {
  let hit = false;
  for (const r of routes) {
    if (matchesAny(f.path, r.include) && !matchesAny(f.path, r.exclude)) {
      if (!bySkill.has(r.skill)) bySkill.set(r.skill, { route: r, files: [] });
      bySkill.get(r.skill).files.push(f.path);
      hit = true;
    }
  }
  if (!hit && routing.fallback && matchesAny(f.path, routing.fallback.include)) {
    const s = routing.fallback.skill;
    if (!bySkill.has(s)) bySkill.set(s, { route: { skill: s }, files: [] });
    bySkill.get(s).files.push(f.path);
    hit = true;
  }
  if (!hit) unrouted.push(f.path);
}

// ---- groups (chunked), cache lookup, diff bundles ----
const promptVersion = sha256(
  ["reviewer-prompt.md", "severity.md"].map((n) => readFileSync(join(SKILL_DIR, "references", n), "utf8")).join("\n"),
);
const groups = [];
for (const [skill, { route, files: paths }] of bySkill) {
  const skillPath = route.reference
    ? join(SKILL_DIR, route.reference)
    : join(skillsDir, skill, "SKILL.md");
  const skillHash = sha256(readFileSync(skillPath, "utf8") + promptVersion);
  const pending = [];
  const cached = [];
  for (const p of paths) {
    const cacheKey = sha256(`${skill}|${skillHash}|${p}|${fileFacts[p].diffHash}`);
    const hit = !args["no-cache"] && existsSync(join(state, "cache", `${cacheKey}.json`));
    (hit ? cached : pending).push({ path: p, cacheKey });
  }
  const chunks = [];
  for (let i = 0; i < pending.length; i += routing.maxFilesPerGroup) chunks.push(pending.slice(i, i + routing.maxFilesPerGroup));
  if (chunks.length === 0) chunks.push([]);
  chunks.forEach((chunk, idx) => {
    const id = chunks.length > 1 ? `${slug(skill)}--${idx + 1}` : slug(skill);
    const diffPath = join(runDir, "groups", `${id}.diff`);
    writeFileSync(diffPath, chunk.map((c) => fileFacts[c.path].diff).join("\n"));
    groups.push({
      id,
      skill,
      skillPath,
      viaScopeDefault: route.viaScopeDefault ?? null,
      files: chunk.map((c) => ({ path: c.path, cacheKey: c.cacheKey, changedLines: toRanges(fileFacts[c.path].added) })),
      cachedFiles: idx === 0 ? cached : [],
      diffPath,
      outputPath: join(runDir, "findings", `${id}.json`),
      moduleDocs: moduleDocs(chunk.map((c) => c.path)),
    });
  });
}

const manifest = {
  fingerprint: fp,
  base,
  mergeBase,
  head,
  createdAt: new Date().toISOString(),
  root,
  runDir,
  noCache: Boolean(args["no-cache"]),
  files: files.map((f) => ({
    path: f.path,
    status: f.untracked ? "untracked" : f.status,
    excluded: fileFacts[f.path].excluded,
    changedLines: toRanges(fileFacts[f.path].added),
  })),
  groups,
  unrouted,
  warnings,
};
writeJson(join(runDir, "manifest.json"), manifest);
writeJson(
  join(runDir, "files.json"),
  Object.fromEntries(Object.entries(fileFacts).map(([p, f]) => [p, { added: f.added, addedText: f.addedText, removedText: f.removedText, status: f.status, untracked: f.untracked }])),
);

// ---- summary ----
const toReview = groups.filter((g) => g.files.length > 0);
const log = [];
log.push(`Fingerprint ${fp}  (base ${base} @ ${mergeBase.slice(0, 8)}, HEAD ${head.slice(0, 8)})`);
log.push(`Changed files: ${files.length} (${reviewable.length} reviewable, ${files.length - reviewable.length} deleted/excluded)`);
if (files.length === 0) log.push("NO_CHANGES — nothing to review.");
for (const g of groups) {
  const cachedNote = g.cachedFiles.length ? `, ${g.cachedFiles.length} cached` : "";
  log.push(`  ${g.files.length ? "REVIEW" : "cached"}  ${g.id}: ${g.files.length} file(s)${cachedNote}`);
}
const unroutedDocs = unrouted.filter((p) => p.endsWith(".md"));
const unroutedOther = unrouted.filter((p) => !p.endsWith(".md"));
if (unroutedOther.length) log.push(`Not covered by any skill: ${unroutedOther.join(", ")}`);
if (unroutedDocs.length) log.push(`Not covered (markdown, expected): ${unroutedDocs.length} file(s)`);
for (const w of warnings) log.push(`WARN ${w}`);
log.push(`Reviewer groups to run: ${toReview.length}`);
log.push(`RUN_DIR=${runDir}`);
console.log(log.join("\n"));

// ---------------------------------------------------------------------------
function slug(s) {
  return s.replace(/^@/, "").replace(/[^a-z0-9-]+/gi, "-");
}

function moduleDocs(paths) {
  const mods = new Set(paths.map((p) => p.split("/")[0]));
  const docs = [];
  for (const m of mods) {
    for (const n of ["CLAUDE.md", "INSIGHTS.md"]) {
      if (existsSync(join(root, m, n))) docs.push(`${m}/${n}`);
    }
  }
  return docs;
}

function parseCatalogScopes(readmePath) {
  if (!existsSync(readmePath)) return {};
  const out = {};
  for (const line of readFileSync(readmePath, "utf8").split("\n")) {
    const m = /^\|\s*\[([^\]]+)\]\([^)]*\)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
