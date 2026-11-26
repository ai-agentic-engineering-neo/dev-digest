"""pr-self-review scripts against a throwaway git repo.

Run: python3 -m unittest discover -s .claude/skills/pr-self-review/tests
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))
import guard_pr  # noqa: E402


def sh(cwd: Path, *args: str, check: bool = True, stdin: str | None = None) -> subprocess.CompletedProcess:
    res = subprocess.run(list(args), cwd=cwd, capture_output=True, text=True, input=stdin)
    if check and res.returncode != 0:
        raise AssertionError(f"{args} failed:\n{res.stdout}\n{res.stderr}")
    return res


class Repo:
    def __init__(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self._out = tempfile.TemporaryDirectory()  # findings live outside the repo (as in SKILL.md)
        self.root = Path(self._tmp.name)
        sh(self.root, "git", "init", "-q", "-b", "main")
        sh(self.root, "git", "config", "user.email", "t@example.com")
        sh(self.root, "git", "config", "user.name", "t")
        self.write(".gitignore", ".devdigest/self-review/\n")
        self.write("README.md", "# x\n")
        self.write("client/messages/en/home.json", json.dumps({"title": "Hi", "empty": {"cta": "Add"}}))
        self.write("server/src/modules/pulls/service.ts", "export const a = 1;\n")
        sh(self.root, "git", "add", "-A")
        sh(self.root, "git", "commit", "-qm", "init")
        sh(self.root, "git", "checkout", "-qb", "feat/x")

    def write(self, path: str, text: str) -> None:
        p = self.root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)

    def run(self, script: str, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        return sh(self.root, sys.executable, str(SCRIPTS / script), *args, check=check)

    def plan(self) -> dict:
        self.run("route_skills.py")
        return json.loads((self.root / ".devdigest/self-review/feat__x.plan.json").read_text())

    def review(self, findings: list[dict] | None = None, mode: str = "quick") -> dict:
        self.run("route_skills.py", "--mode", mode)
        self.run("run_checks.py")
        args = ["build"]
        if findings is not None:
            f = Path(self._out.name) / "findings.json"
            f.write_text(json.dumps({"findings": findings}))
            args += ["--findings", str(f)]
        self.run("write_report.py", *args)
        return json.loads((self.root / ".devdigest/self-review/feat__x.json").read_text())

    def close(self) -> None:
        self._tmp.cleanup()
        self._out.cleanup()


class RepoCase(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = Repo()

    def tearDown(self) -> None:
        self.repo.close()


class RoutingTest(RepoCase):
    def test_client_file_goes_to_ui_and_security_only(self):
        self.repo.write("client/src/components/Button/Button.tsx", "export function Button() { return null }\n")
        plan = self.repo.plan()
        self.assertEqual(set(plan["groups"]), {"ui", "security"})
        self.assertIn("frontend-architecture", plan["groups"]["ui"]["sources"])
        self.assertNotIn("next-best-practices", plan["groups"]["ui"]["sources"])

    def test_app_route_adds_next_best_practices(self):
        self.repo.write("client/src/app/page.tsx", "export default function Page() { return null }\n")
        self.assertIn("next-best-practices", self.repo.plan()["groups"]["ui"]["sources"])

    def test_server_file_goes_to_backend_security_performance(self):
        self.repo.write("server/src/modules/pulls/repository.ts", "export const r = 1;\n")
        plan = self.repo.plan()
        self.assertEqual(set(plan["groups"]), {"backend", "security", "performance"})
        self.assertIn("drizzle-orm-patterns", plan["groups"]["backend"]["sources"])
        self.assertNotIn("zod", plan["groups"]["backend"]["sources"])

    def test_zod_route_triggers_on_content(self):
        self.repo.write("server/src/modules/pulls/schema.ts", "const S = z.object({ a: z.string() });\n")
        self.assertIn("zod", self.repo.plan()["groups"]["backend"]["sources"])

    def test_docs_only_are_unrouted(self):
        self.repo.write("docs/notes.md", "hello\n")
        plan = self.repo.plan()
        self.assertEqual(plan["groups"], {})
        self.assertEqual(plan["unrouted_files"], ["docs/notes.md"])

    def test_collects_committed_staged_unstaged_and_untracked(self):
        self.repo.write("server/src/modules/pulls/service.ts", "export const a = 2;\n")   # unstaged
        self.repo.write("client/src/a.ts", "export const a = 1;\n")
        sh(self.repo.root, "git", "add", "client/src/a.ts")                                # staged
        self.repo.write("client/src/b.ts", "export const b = 1;\n")
        sh(self.repo.root, "git", "add", "client/src/b.ts")
        sh(self.repo.root, "git", "commit", "-qm", "b")                                     # committed
        self.repo.write("client/src/c.ts", "export const c = 1;\n")                         # untracked
        paths = {f["path"] for f in self.repo.plan()["files"]}
        self.assertEqual(paths, {"server/src/modules/pulls/service.ts", "client/src/a.ts",
                                 "client/src/b.ts", "client/src/c.ts"})

    def test_unmapped_skill_is_warned(self):
        self.repo.write(".claude/skills/new-skill/SKILL.md", "---\nname: new-skill\n---\n")
        kinds = [w["message"] for w in self.repo.plan()["warnings"] if w["kind"] == "unmapped-skill"]
        self.assertEqual(len(kinds), 1)
        self.assertIn("new-skill", kinds[0])

    def test_cache_skips_unchanged_reviewed_files(self):
        self.repo.write("client/src/a.ts", "export const a = 1;\n")
        self.repo.write("client/src/b.ts", "export const b = 1;\n")
        self.repo.review([])
        self.repo.write("client/src/b.ts", "export const b = 2;\n")
        self.repo.run("route_skills.py", "--mode", "quick")
        plan = json.loads((self.repo.root / ".devdigest/self-review/feat__x.plan.json").read_text())
        self.assertEqual([f["path"] for f in plan["groups"]["ui"]["files"]], ["client/src/b.ts"])
        self.assertEqual([f["path"] for f in plan["groups"]["ui"]["cached_files"]], ["client/src/a.ts"])


class ChecksTest(RepoCase):
    def test_secret_on_added_line_blocks(self):
        self.repo.write("server/src/modules/pulls/key.ts", 'const k = "sk-ant-' + "a" * 30 + '";\n')
        report = self.repo.review([])
        self.assertEqual(report["verdict"], "blocked")
        self.assertTrue(any(f["source"] == "check:secrets" for f in report["findings"]))

    def test_missing_i18n_key_blocks(self):
        self.repo.write("client/src/app/page.tsx",
                        'const t = useTranslations("home");\nt("title");\nt("empty.cta");\nt("nope");\n')
        report = self.repo.review([])
        i18n = [f for f in report["findings"] if f["source"] == "check:i18n"]
        self.assertEqual([(f["line"], f["severity"]) for f in i18n], [(4, "CRITICAL")])


class ReportAndGateTest(RepoCase):
    def setUp(self) -> None:
        super().setUp()
        self.repo.write("server/src/modules/pulls/routes.ts", "import { db } from '../../db';\nexport {};\n")
        sh(self.repo.root, "git", "add", "-A")
        sh(self.repo.root, "git", "commit", "-qm", "routes")
        self.crit = {"source": "onion-architecture", "rule": "route imports db",
                     "file": "server/src/modules/pulls/routes.ts", "line": 1,
                     "severity": "CRITICAL", "verified": True, "evidence": "import { db }", "fix": "use service"}

    def gate(self) -> bool:
        return guard_pr.gate_status(self.repo.root)[0]

    def test_no_report_blocks(self):
        self.assertFalse(self.gate())

    def test_verified_critical_blocks_and_dismiss_unblocks(self):
        report = self.repo.review([self.crit])
        self.assertEqual(report["verdict"], "blocked")
        self.assertFalse(self.gate())
        fid = report["findings"][0]["id"]
        self.repo.run("write_report.py", "dismiss", "--id", fid, "--reason", "short", check=False)
        self.assertFalse(self.gate())  # reason too short -> refused
        self.repo.run("write_report.py", "dismiss", "--id", fid, "--reason", "user: db import is type-only here")
        self.assertTrue(self.gate())

    def test_unverified_critical_is_downgraded(self):
        report = self.repo.review([{**self.crit, "verified": False}])
        self.assertEqual(report["verdict"], "pass")
        self.assertEqual(report["findings"][0]["severity"], "WARNING")

    def test_off_diff_finding_is_dropped(self):
        report = self.repo.review([{**self.crit, "file": "README.md", "line": 1}])
        self.assertEqual(report["dropped_off_diff"], 1)
        self.assertEqual(report["verdict"], "pass")

    def test_edit_after_review_makes_report_stale(self):
        self.repo.review([])
        self.assertTrue(self.gate())
        self.repo.write("server/src/modules/pulls/routes.ts", "export {};\n")
        ok, msg = guard_pr.gate_status(self.repo.root)
        self.assertFalse(ok)
        self.assertIn("stale", msg)

    def test_commit_after_review_keeps_report_valid(self):
        self.repo.write("server/src/modules/pulls/extra.ts", "export const e = 1;\n")
        self.repo.review([])
        sh(self.repo.root, "git", "add", "-A")
        sh(self.repo.root, "git", "commit", "-qm", "extra")
        self.assertTrue(self.gate())

    def test_hook_mode_blocks_gh_pr_create(self):
        payload = json.dumps({"tool_name": "Bash", "cwd": str(self.repo.root),
                              "tool_input": {"command": "gh pr create --fill"}})
        res = sh(self.repo.root, sys.executable, str(SCRIPTS / "guard_pr.py"), check=False, stdin=payload)
        self.assertEqual(res.returncode, 2)
        self.assertIn("BLOCKED by pr-self-review", res.stderr)


FAKE_CLAUDE = """#!/usr/bin/env bash
# Stands in for `claude -p`: records argv + stdin, then runs the skill scripts.
printf '%s\\n' "$@" > "$FAKE_LOG.args"
cat > "$FAKE_LOG.stdin"
S="$FAKE_SCRIPTS"
python3 "$S/route_skills.py" --mode quick >/dev/null
python3 "$S/run_checks.py" >/dev/null
if [ -n "${FAKE_FINDINGS:-}" ]; then
  cp "$FAKE_FINDINGS" .devdigest/self-review/findings/backend.json
  python3 "$S/write_report.py" build --findings .devdigest/self-review/findings/backend.json
else
  python3 "$S/write_report.py" build
fi
"""
PUSH_REF = "refs/heads/feat/x " + "a" * 40 + " refs/heads/feat/x " + "0" * 40 + "\n"


class AutoReviewTest(RepoCase):
    def setUp(self) -> None:
        super().setUp()
        self.repo.write("server/src/modules/pulls/routes.ts", "import { db } from '../../db';\nexport {};\n")
        self.bin = Path(self.repo._out.name) / "bin"
        self.bin.mkdir()
        (self.bin / "claude").write_text(FAKE_CLAUDE)
        (self.bin / "claude").chmod(0o755)
        self.log = Path(self.repo._out.name) / "claude"

    def push(self, stdin: str = PUSH_REF, **env: str) -> subprocess.CompletedProcess:
        import os
        full = {**os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}", "FAKE_LOG": str(self.log),
                "FAKE_SCRIPTS": str(SCRIPTS), **env}
        full.pop("PR_SELF_REVIEW_RUNNING", None)
        return subprocess.run([sys.executable, str(SCRIPTS / "auto_review.py")], cwd=self.repo.root,
                              input=stdin, capture_output=True, text=True, env=full)

    def test_missing_report_runs_review_and_passes(self):
        res = self.push()
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertIn("/pr-self-review", self.log.with_suffix(".args").read_text())
        self.assertEqual(self.log.with_suffix(".stdin").read_text(), "")  # git refs not leaked
        self.assertTrue(guard_pr.gate_status(self.repo.root)[0])

    def test_critical_from_auto_review_blocks_push(self):
        crit = Path(self.repo._out.name) / "crit.json"
        crit.write_text(json.dumps({"group": "backend", "findings": [{
            "source": "onion-architecture", "rule": "route imports db", "severity": "CRITICAL",
            "file": "server/src/modules/pulls/routes.ts", "line": 1, "verified": True}]}))
        res = self.push(FAKE_FINDINGS=str(crit))
        self.assertEqual(res.returncode, 1)
        self.assertIn("CRITICAL", res.stderr)

    def test_fresh_report_does_not_rerun(self):
        self.repo.review([])
        res = self.push()
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertFalse(self.log.with_suffix(".args").exists())

    def test_auto_off_only_gates(self):
        res = self.push(PR_SELF_REVIEW_AUTO="0")
        self.assertEqual(res.returncode, 1)
        self.assertFalse(self.log.with_suffix(".args").exists())

    def test_branch_delete_is_not_gated(self):
        delete = "(delete) " + "0" * 40 + " refs/heads/old " + "b" * 40 + "\n"
        self.assertEqual(self.push(stdin=delete).returncode, 0)
        self.assertFalse(self.log.with_suffix(".args").exists())


class GatedCommandTest(unittest.TestCase):
    def test_patterns(self):
        gated = ["git push", "git push -u origin feat/x", "gh pr create --fill", "gh pr merge 12 --squash",
                 "cd x && git push", "git -C /r push origin HEAD", "git push --tags && git push",
                 "cat > f <<'EOF'\nhello\nEOF\ngit push"]
        free = ["git status", "git push origin --delete old", "git push --tags", "git push --dry-run",
                "gh pr view 3", "echo pushed", "git pushx",
                "git commit -m 'run git push later'", 'echo "then gh pr create"',
                "ls  # git push after this",
                "cat > hook <<'EOF'\n# Only gate:  PR_SELF_REVIEW_AUTO=0 git push\nEOF\nchmod +x hook"]
        for c in gated:
            self.assertTrue(guard_pr.is_gated(c), c)
        for c in free:
            self.assertFalse(guard_pr.is_gated(c), c)


if __name__ == "__main__":
    unittest.main()
