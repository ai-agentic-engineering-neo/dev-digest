#!/usr/bin/env node
// The gate. Allows a PR action only if the current local changes have a full
// self-review verdict of PASS. Never runs an LLM — it only reads the verdict.
//
// Claude Code PreToolUse hook (Bash): reads the hook JSON from stdin, acts only
// on `gh pr create|ready|merge`, exits 2 with a reason to block.
//   node gate.mjs
// Any other caller (git pre-push hook, CI script, a human):
//   node gate.mjs --cli [--base <branch>]      exit 0 = allowed, 1 = blocked
import { readFileSync } from "node:fs";
import { changedFiles, fingerprint, parseArgs, readJson, repoRoot, resolveBase, stateDir, verdictPath } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const cli = Boolean(args.cli);
let requestedBase = typeof args.base === "string" ? args.base : undefined;
let cwd = process.cwd();

if (!cli) {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0); // not our business — never break unrelated tool calls
  }
  const command = String(input?.tool_input?.command ?? "");
  // Only a real invocation: `gh` must start a shell segment (start, after ; && || | ( or newline,
  // optionally behind env assignments). A command that merely mentions the text — echo, grep,
  // a heredoc body, a JSON string — must pass untouched.
  const invocation = /(?:^|[;&|(\n]|\$\()\s*(?:[A-Za-z_]\w*=\S*\s+)*gh\s+pr\s+(?:create|ready|merge)\b[^;&|\n]*/m.exec(command);
  if (!invocation) process.exit(0);
  const m = /(?:--base|-B)[=\s]+["']?([\w./-]+)/.exec(invocation[0]);
  if (m) requestedBase = m[1];
  if (input.cwd) cwd = input.cwd;
}

function block(message) {
  if (cli) {
    console.error(message);
    process.exit(1);
  }
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

let root;
let fp;
try {
  root = repoRoot(cwd);
  const { mergeBase } = resolveBase(root, requestedBase);
  const files = changedFiles(root, mergeBase);
  if (files.length === 0) process.exit(0);
  fp = fingerprint(root, mergeBase, files);
} catch (e) {
  block(`pr-self-review gate could not compute the change fingerprint: ${e.message}`);
}

const verdict = readJson(verdictPath(stateDir(root), fp), null);
const base = requestedBase ? ` --base ${requestedBase}` : "";
if (!verdict) {
  block(
    `PR blocked: no self-review for the current changes (fingerprint ${fp}). ` +
      `Run /pr-self-review${base} first — any edit after a review needs a new one.`,
  );
}
if (verdict.status !== "pass") {
  const list = verdict.criticals
    .filter((c) => !c.waived)
    .map((c) => `  - [${c.id}] ${c.file}:${c.line} ${c.title} (${c.source})`)
    .join("\n");
  const why =
    verdict.status === "quick-pass"
      ? "only a --quick review exists; run the full /pr-self-review."
      : verdict.incomplete.length
        ? `review incomplete (${verdict.incomplete.join(", ")}).`
        : `${verdict.criticals.filter((c) => !c.waived).length} unresolved critical finding(s):\n${list}`;
  block(`PR blocked by /pr-self-review (fingerprint ${fp}): ${why}\nReport: ${verdict.reportPath}`);
}
if (cli) console.log(`pr-self-review: PASS (fingerprint ${fp})`);
process.exit(0);
