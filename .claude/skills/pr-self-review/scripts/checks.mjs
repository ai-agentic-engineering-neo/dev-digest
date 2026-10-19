#!/usr/bin/env node
// Step 2: deterministic gates — no LLM. Project rules from the root CLAUDE.md
// plus typecheck / arch:check (and tests with --with-tests) for touched packages.
//
//   node checks.mjs --run <RUN_DIR> [--with-tests] [--skip-commands]
//
// Writes <RUN_DIR>/checks.json. Every finding here is a fact, so it skips the
// LLM verification step.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, readJson, writeJson } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (typeof args.run !== "string") throw new Error("Usage: checks.mjs --run <RUN_DIR>");
const manifest = readJson(join(args.run, "manifest.json"));
const facts = readJson(join(args.run, "files.json"));
const root = manifest.root;
const changed = manifest.files.map((f) => f.path);
const has = (prefix) => changed.some((p) => p.startsWith(prefix));
const findings = [];
const add = (f) => findings.push({ source: "project-rules", severity: "critical", line: 1, ...f });

// ---- 1. Migrations are generated: never hand-edited without a schema change ----
const migrations = changed.filter((p) => p.startsWith("server/src/db/migrations/"));
const schemaChanged = changed.some((p) => p === "server/src/db/schema.ts" || p.startsWith("server/src/db/schema/"));
if (migrations.length && !schemaChanged) {
  for (const p of migrations) {
    add({
      file: p,
      rule: "project/migrations-are-generated",
      title: "Migration changed without a schema change",
      evidence: p,
      why: "server/src/db/migrations/** is generated (root CLAUDE.md, Do not touch). Edit the schema and run `pnpm db:generate`.",
      fix: "Revert the migration edit; change server/src/db/schema* and regenerate.",
    });
  }
}

// ---- 2. Zod contracts live twice: a change must land in both copies ----
const SHARED = ["server/src/vendor/shared/", "client/src/vendor/shared/"];
for (const p of changed) {
  const side = SHARED.findIndex((s) => p.startsWith(s));
  if (side === -1) continue;
  const twin = SHARED[1 - side] + p.slice(SHARED[side].length);
  if (!changed.includes(twin)) {
    const firstAdded = facts[p]?.added?.[0];
    add({
      file: p,
      line: firstAdded ?? 1,
      rule: "project/contract-twin",
      title: "Shared contract changed in only one copy",
      evidence: facts[p]?.addedText?.[0] ?? p,
      why: `Contracts exist twice (root CLAUDE.md). ${twin} was not changed in this diff.`,
      fix: `Apply the same change to ${twin}.`,
    });
  }
}

// ---- 3. Secrets: never in git ----
const SECRET_PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic API key"],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/, "OpenAI-style API key"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}/, "GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{50,}/, "GitHub fine-grained token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "Private key"],
];
for (const [path, f] of Object.entries(facts)) {
  const base = path.split("/").pop();
  if (/^\.env(\..+)?$/.test(base) && !/\.(example|sample|template)$/.test(base) && f.status !== "D") {
    add({ file: path, rule: "project/no-committed-env", title: "Env file added to the repo", evidence: path,
      why: "Secrets go through SecretsProvider (~/.devdigest/secrets.json) only — never a committed .env.", fix: "Remove the file and add it to .gitignore." });
  }
  f.addedText.forEach((text, i) => {
    const hit = SECRET_PATTERNS.find(([re]) => re.test(text));
    if (hit) {
      add({ file: path, line: f.added[i], rule: "project/no-secrets", title: `${hit[1]} in diff`, evidence: text.trim().slice(0, 200),
        why: "Secrets go through SecretsProvider only — never DB, git or a committed file.", fix: "Remove it, rotate the credential, load it via SecretsProvider." });
    }
  });
}

// ---- 4. INJECTION_GUARD / grounding gate must never be weakened ----
for (const [path, f] of Object.entries(facts)) {
  if (!path.startsWith("reviewer-core/")) continue;
  const removed = f.removedText.filter((t) => /INJECTION_GUARD/.test(t));
  const readded = f.addedText.filter((t) => /INJECTION_GUARD/.test(t));
  if (removed.length > readded.length) {
    add({ file: path, line: f.added[0] ?? 1, side: "removed", rule: "project/injection-guard", title: "INJECTION_GUARD usage removed",
      evidence: removed[0].trim(), why: "INJECTION_GUARD must never be weakened or removed (root CLAUDE.md, Do not touch).", fix: "Restore the guard." });
  }
}

// ---- 5. Package commands for touched packages ----
const commands = [];
if (!args["skip-commands"]) {
  const plan = [];
  if (has("server/")) {
    plan.push(["server: typecheck", "server", "pnpm", ["typecheck"]]);
    plan.push(["server: arch:check", "server", "pnpm", ["arch:check"]]);
    if (args["with-tests"]) plan.push(["server: unit tests", "server", "pnpm", ["exec", "vitest", "run", "--exclude", "**/*.it.test.ts"]]);
  }
  if (has("client/")) {
    plan.push(["client: typecheck", "client", "pnpm", ["typecheck"]]);
    if (args["with-tests"]) plan.push(["client: tests", "client", "pnpm", ["test"]]);
  }
  if (has("reviewer-core/")) {
    plan.push(["reviewer-core: typecheck", "reviewer-core", "npm", ["run", "typecheck"]]);
    if (args["with-tests"]) plan.push(["reviewer-core: tests", "reviewer-core", "npm", ["test"]]);
  }
  for (const [name, dir, bin, argv] of plan) {
    const cwd = join(root, dir);
    if (!existsSync(join(cwd, "node_modules"))) {
      commands.push({ name, cmd: `${bin} ${argv.join(" ")}`, cwd: dir, ok: null, skipped: "node_modules missing — install deps to run it" });
      continue;
    }
    const t0 = Date.now();
    const r = spawnSync(bin, argv, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
    const ok = r.status === 0;
    commands.push({ name, cmd: `${bin} ${argv.join(" ")}`, cwd: dir, ok, durationMs: Date.now() - t0, outputTail: out.split("\n").slice(-40).join("\n") });
    if (!ok) {
      add({ file: dir, rule: `command/${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`, title: `${name} failed`,
        evidence: `${bin} ${argv.join(" ")}`, why: out.split("\n").slice(-15).join("\n"), fix: "Fix the errors above and re-run the self-review." });
    }
  }
}

writeJson(join(args.run, "checks.json"), { commands, findings });
for (const c of commands) console.log(`${c.ok === true ? "PASS" : c.ok === false ? "FAIL" : "SKIP"}  ${c.name}${c.skipped ? ` (${c.skipped})` : ""}`);
console.log(`project-rules findings: ${findings.length}${findings.length ? ` (${findings.map((f) => f.rule).join(", ")})` : ""}`);
