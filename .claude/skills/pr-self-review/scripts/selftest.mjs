#!/usr/bin/env node
// Regression test for the deterministic half of pr-self-review: routing,
// fingerprint, grounding, new-only filter, verification, waivers, cache, gate.
// Builds a throwaway git repo, plays the reviewer/verifier roles with canned
// JSON, and asserts verdicts. No LLM, no network.
//
//   node selftest.mjs            (exit 0 = all scenarios pass)
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SKILL_DIR, readJson } from "./lib.mjs";

const repo = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "pr-self-review-test-"));
const S = join(repo, ".claude/skills/pr-self-review/scripts");
let failures = 0;

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: repo, encoding: "utf8", ...opts });
const g = (...a) => sh("git", a);
const write = (p, c) => {
  mkdirSync(dirname(join(repo, p)), { recursive: true });
  writeFileSync(join(repo, p), c);
};
const node = (script, ...a) => sh("node", [join(S, script), ...a]);
const gate = (command) =>
  spawnSync("node", [join(S, "gate.mjs")], { cwd: repo, encoding: "utf8", input: JSON.stringify({ tool_input: { command }, cwd: repo }) });
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${!cond && detail ? `\n     ${detail}` : ""}`);
  if (!cond) failures++;
};
const prepare = (...a) => {
  const out = node("prepare.mjs", ...a);
  const runDir = /RUN_DIR=(.*)/.exec(out)[1].trim();
  return { out, runDir, manifest: readJson(join(runDir, "manifest.json")) };
};
const review = (manifest, skill, findings) => {
  for (const grp of manifest.groups.filter((x) => x.skill === skill && x.files.length)) {
    writeFileSync(grp.outputPath, JSON.stringify({ group: grp.id, skill, reviewed: grp.files.map((f) => f.path), findings }));
  }
};
const reviewAllEmpty = (manifest) => {
  for (const grp of manifest.groups.filter((x) => x.files.length)) review(manifest, grp.skill, []);
};
const finalize = (runDir, ...a) => {
  const out = node("finalize.mjs", "--run", runDir, ...a);
  return { out, verdict: /VERDICT=(\S+)/.exec(out)?.[1] };
};

try {
  // ---------------------------------------------------------------- fixture
  g("init", "-q", "-b", "main");
  g("config", "user.email", "t@t");
  g("config", "user.name", "t");
  cpSync(SKILL_DIR, join(repo, ".claude/skills/pr-self-review"), { recursive: true });
  for (const s of ["onion-architecture", "frontend-ui-architecture", "security", "zod", "typescript-expert", "mermaid-diagram", "brand-new-skill"]) {
    write(`.claude/skills/${s}/SKILL.md`, `---\nname: ${s}\n---\n# ${s}\n`);
  }
  write(".claude/skills/README.md", "| Skill | Scope | Description |\n|---|---|---|\n| [brand-new-skill](brand-new-skill/SKILL.md) | Backend | test |\n");
  write("server/CLAUDE.md", "# server\n");
  write("server/src/modules/repos/service.ts", "export class ReposService {\n  list() {\n    return [];\n  }\n}\n");
  write("server/src/vendor/shared/contracts/a.ts", "export const A = 1;\n");
  write("client/src/vendor/shared/contracts/a.ts", "export const A = 1;\n");
  write("client/src/app/page.tsx", "export default function Page() {\n  return null;\n}\n");
  write("docs/readme.md", "hello\n");
  g("add", "-A");
  g("commit", "-qm", "base");
  g("checkout", "-qb", "feature");

  // ------------------------------------------------- 1. docs-only change
  write("docs/readme.md", "hello world\n");
  check("gate blocks gh pr create before any review", gate("gh pr create --fill").status === 2);
  check("gate ignores unrelated commands", gate("git status").status === 0);
  check("gate ignores commands that only mention the text", gate(`echo '{"command":"gh pr create --fill"}' | jq . && grep -r "gh pr merge" docs`).status === 0);
  check("gate catches gh after && and env assignments", gate("cd /tmp && GH_PROMPT_DISABLED=1 gh pr merge 12 --squash").status === 2);
  check("gate catches gh inside $( )", gate('url=$(gh pr create --fill)').status === 2);
  let r = prepare();
  check("docs-only change has no reviewer groups", r.manifest.groups.length === 0, JSON.stringify(r.manifest.groups));
  node("checks.mjs", "--run", r.runDir, "--skip-commands");
  check("docs-only change passes", finalize(r.runDir).verdict === "PASS");
  check("gate allows after PASS", gate("gh pr create --fill").status === 0);
  g("commit", "-qam", "docs");
  check("committing reviewed changes keeps the verdict valid", gate("gh pr create --fill").status === 0);

  // ------------------------------------------------- 2. routing + criticals
  write(
    "server/src/modules/repos/service.ts",
    'import { eq } from "drizzle-orm";\nexport class ReposService {\n  list() {\n    return [];\n  }\n}\n',
  );
  write("client/src/app/page.tsx", "export default function Page() {\n  fetch('/api/x');\n  return null;\n}\n");
  check("gate blocks after an edit invalidates the fingerprint", gate("gh pr create").status === 2);
  r = prepare();
  const skillsFor = (p) => r.manifest.groups.filter((x) => x.files.some((f) => f.path === p)).map((x) => x.skill).sort();
  check("server file → onion + security, no frontend skills", JSON.stringify(skillsFor("server/src/modules/repos/service.ts")) === JSON.stringify(["brand-new-skill", "onion-architecture", "security"]), skillsFor("server/src/modules/repos/service.ts").join());
  check("client file → frontend-ui-architecture, no onion", skillsFor("client/src/app/page.tsx").includes("frontend-ui-architecture") && !skillsFor("client/src/app/page.tsx").includes("onion-architecture"), skillsFor("client/src/app/page.tsx").join());
  check("unrouted skill with catalog scope gets a warning + default route", r.manifest.warnings.some((w) => w.includes("brand-new-skill")));
  check("notReviewers skill never reviews", !r.manifest.groups.some((x) => x.skill === "mermaid-diagram"));
  node("checks.mjs", "--run", r.runDir, "--skip-commands");
  reviewAllEmpty(r.manifest);
  review(r.manifest, "onion-architecture", [
    { severity: "critical", file: "server/src/modules/repos/service.ts", line: 9, rule: "onion/no-drizzle-in-service", title: "drizzle in service", evidence: 'import { eq } from "drizzle-orm";', why: "x" },
    { severity: "major", file: "server/src/modules/repos/service.ts", line: 3, rule: "onion/fake", title: "made-up quote", evidence: "this line does not exist anywhere" },
    { severity: "critical", file: "server/src/modules/repos/service.ts", line: 4, rule: "onion/old-code", title: "pre-existing", evidence: "return [];" },
  ]);
  const cand = node("finalize.mjs", "--run", r.runDir, "--stage", "candidates");
  const candidates = readJson(join(r.runDir, "candidates.json"));
  check("only the grounded, new-line critical is a candidate", candidates.length === 1 && candidates[0].rule === "onion/no-drizzle-in-service", cand);
  check("finding is re-anchored to the real line", candidates[0]?.line === 1);
  let f = finalize(r.runDir);
  const final = readJson(join(r.runDir, "findings.final.json"));
  check("ungrounded finding is dropped", final.dropped.some((d) => d.rule === "onion/fake"));
  check("finding on unchanged line becomes info", final.findings.some((x) => x.rule === "onion/old-code" && x.severity === "info"));
  check("unverified critical blocks (fail-safe)", f.verdict === "BLOCK");
  check("gate blocks on BLOCK verdict", gate("gh pr create").status === 2);

  writeFileSync(join(r.runDir, "verify", `${candidates[0].id}.json`), JSON.stringify({ id: candidates[0].id, verdict: "refuted", reason: "test" }));
  f = finalize(r.runDir);
  check("refuted critical is downgraded → PASS", f.verdict === "PASS", f.out.slice(0, 400));

  writeFileSync(join(r.runDir, "verify", `${candidates[0].id}.json`), JSON.stringify({ id: candidates[0].id, verdict: "confirmed", reason: "test" }));
  check("confirmed critical blocks", finalize(r.runDir).verdict === "BLOCK");
  check("waiver without a real reason is ignored", finalize(r.runDir, "--waive", `${candidates[0].id}=ok`).verdict === "BLOCK");
  check("waiver with a reason passes", finalize(r.runDir, "--waive", `${candidates[0].id}=accepted by the team for this release`).verdict === "PASS");
  check("quick verdict never unlocks the gate", finalize(r.runDir, "--quick").verdict === "QUICK-PASS" && gate("gh pr create").status === 2);

  // ------------------------------------------------- 3. cache
  finalize(r.runDir, "--waive", `${candidates[0].id}=accepted by the team for this release`);
  const r2 = prepare();
  check("unchanged files are served from cache", r2.manifest.groups.every((x) => x.files.length === 0), r2.out);
  node("checks.mjs", "--run", r2.runDir, "--skip-commands");
  check("cached confirmed critical still blocks without the waiver", finalize(r2.runDir).verdict === "BLOCK");
  write("client/src/app/page.tsx", "export default function Page() {\n  return <main />;\n}\n");
  const r3 = prepare();
  check("only the edited file is re-reviewed", r3.manifest.groups.filter((x) => x.files.length).every((x) => x.files.every((ff) => ff.path === "client/src/app/page.tsx")), r3.out);

  // ------------------------------------------------- 4. project rules
  write("server/src/vendor/shared/contracts/a.ts", "export const A = 2;\n");
  write("server/src/db/migrations/0001_x.sql", "select 1;\n");
  // Built at runtime so this file itself never contains a key-shaped literal.
  write("server/src/config.ts", `const k = "${["sk", "ant", "api03", "abcdefghijklmnopqrstuvwxyz0123"].join("-")}";\n`);
  r = prepare();
  node("checks.mjs", "--run", r.runDir, "--skip-commands");
  const rules = readJson(join(r.runDir, "checks.json")).findings.map((x) => x.rule);
  check("contract changed in one copy → critical", rules.includes("project/contract-twin"), rules.join());
  check("migration without schema change → critical", rules.includes("project/migrations-are-generated"));
  check("secret in diff → critical", rules.includes("project/no-secrets"));
  check("migrations are excluded from LLM review", !r.manifest.groups.some((x) => x.files.some((ff) => ff.path.includes("migrations"))));
  reviewAllEmpty(r.manifest);
  check("project-rule criticals block", finalize(r.runDir).verdict === "BLOCK");

  // ------------------------------------------------- 5. incomplete review
  r = prepare("--no-cache");
  node("checks.mjs", "--run", r.runDir, "--skip-commands");
  check("missing reviewer output → BLOCK (incomplete)", finalize(r.runDir).verdict === "BLOCK");
} catch (e) {
  failures++;
  console.error(e.stdout ?? "", e.stderr ?? "", e);
} finally {
  rmSync(repo, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
