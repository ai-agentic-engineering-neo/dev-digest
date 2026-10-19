#!/usr/bin/env node
// Optional: publish the verdict as a GitHub commit status on HEAD so branch
// protection can require it (context "devdigest/self-review"). Outward-facing —
// run only when the user asked for it.
//
//   node post-status.mjs [--base <branch>] [--dry-run]
//
// Refuses when the working tree has uncommitted changes: the status is attached
// to a commit, so HEAD must contain exactly what was reviewed.
import { execFileSync } from "node:child_process";
import { changedFiles, fingerprint, git, parseArgs, readJson, repoRoot, resolveBase, stateDir, verdictPath } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const root = repoRoot();
const { mergeBase } = resolveBase(root, typeof args.base === "string" ? args.base : undefined);

const dirty = git(["status", "--porcelain", "--untracked-files=normal"], { cwd: root }).trim();
if (dirty) {
  console.error("Refusing: uncommitted or untracked changes. Commit (and push) first so HEAD is what was reviewed.");
  process.exit(1);
}
const fp = fingerprint(root, mergeBase, changedFiles(root, mergeBase));
const verdict = readJson(verdictPath(stateDir(root), fp), null);
if (!verdict) {
  console.error(`No verdict for fingerprint ${fp}. Run /pr-self-review first.`);
  process.exit(1);
}
const sha = git(["rev-parse", "HEAD"], { cwd: root }).trim();
const state = verdict.status === "pass" ? "success" : "failure";
const description =
  verdict.status === "pass"
    ? `PASS · ${verdict.counts.major} major, ${verdict.counts.minor} minor`
    : `BLOCK · ${verdict.criticals.filter((c) => !c.waived).length} critical`;
const cmd = ["api", "-X", "POST", `repos/{owner}/{repo}/statuses/${sha}`,
  "-f", `state=${state}`, "-f", "context=devdigest/self-review", "-f", `description=${description.slice(0, 140)}`];

if (args["dry-run"]) {
  console.log(`gh ${cmd.join(" ")}`);
  process.exit(0);
}
execFileSync("gh", cmd, { cwd: root, stdio: "inherit" });
console.log(`Posted devdigest/self-review=${state} on ${sha.slice(0, 8)}.`);
