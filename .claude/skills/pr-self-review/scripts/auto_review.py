#!/usr/bin/env python3
"""git pre-push entry point: run pr-self-review automatically when needed, then gate.

Called by scripts/git-hooks/pre-push with git's ref lines on stdin.

  report fresh + pass      -> push goes through, nothing runs
  report fresh + blocked   -> push refused (same diff gives the same verdict)
  report missing / stale   -> runs the skill headless (`claude -p`), then gates
  branch delete / tag-only -> never gated

Env:
  PR_SELF_REVIEW_AUTO=0           don't run the review, only gate
  PR_SELF_REVIEW_MODE=quick       quick mode instead of full
  PR_SELF_REVIEW_TIMEOUT=1800     seconds before the headless run is killed
  PR_SELF_REVIEW_BUDGET_USD=3     optional spend cap for the headless run
  PR_SELF_REVIEW_MODEL=<model>    optional model override
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import repo_root  # noqa: E402
from guard_pr import HUMAN_HOW, gate_state  # noqa: E402

ZERO = "0" * 40
NESTED = "PR_SELF_REVIEW_RUNNING"

SYSTEM = (
    "This is a NON-INTERACTIVE run started by the git pre-push hook. Nobody can answer questions. "
    "Run the pr-self-review workflow end to end and stop after `write_report.py build` printed the verdict. "
    "Write subagent findings files ONLY into .devdigest/self-review/findings/. "
    "Do NOT edit source files, do NOT fix anything, do NOT dismiss findings, do NOT commit or push. "
    "Finish with the verdict line and every CRITICAL (id, file:line, rule, fix)."
)
ALLOWED = [
    "Skill", "Read", "Grep", "Glob", "Agent",
    "Write(.devdigest/self-review/**)",
    "Bash(python3 .claude/skills/pr-self-review/scripts/*)",
    "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)", "Bash(git status:*)",
]
DISALLOWED = ["Edit", "NotebookEdit", "Bash(git push:*)", "Bash(git commit:*)", "Bash(gh:*)"]


def err(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def only_deletes_or_tags(ref_lines: list[str]) -> bool:
    refs = [l.split() for l in ref_lines if l.strip()]
    if not refs:
        return False
    return all(len(r) == 4 and (r[1] == ZERO or r[0].startswith("refs/tags/")) for r in refs)


def headless_review(root: Path) -> int:
    mode = os.environ.get("PR_SELF_REVIEW_MODE", "full")
    prompt = "/pr-self-review" + (" --quick" if mode == "quick" else "")
    cmd = ["claude", "-p", prompt, "--append-system-prompt", SYSTEM,
           "--allowedTools", *ALLOWED, "--disallowedTools", *DISALLOWED]
    if os.environ.get("PR_SELF_REVIEW_BUDGET_USD"):
        cmd += ["--max-budget-usd", os.environ["PR_SELF_REVIEW_BUDGET_USD"]]
    if os.environ.get("PR_SELF_REVIEW_MODEL"):
        cmd += ["--model", os.environ["PR_SELF_REVIEW_MODEL"]]
    timeout = int(os.environ.get("PR_SELF_REVIEW_TIMEOUT", "1800"))
    err(f"pr-self-review: running automatic review ({mode}) before push, this can take a few minutes…")
    try:
        # stdin=DEVNULL: git's ref lines must not leak into the prompt
        res = subprocess.run(cmd, cwd=root, stdin=subprocess.DEVNULL, stdout=sys.stderr,
                             stderr=sys.stderr, timeout=timeout, env={**os.environ, NESTED: "1"})
        return res.returncode
    except subprocess.TimeoutExpired:
        err(f"pr-self-review: automatic review timed out after {timeout}s")
        return 124


def main() -> int:
    if os.environ.get(NESTED):
        return 0
    ref_lines = [] if sys.stdin.isatty() else sys.stdin.read().splitlines()
    if only_deletes_or_tags(ref_lines):
        return 0

    root = repo_root()
    state, msg = gate_state(root)
    if state == "ok":
        err(msg)
        return 0
    if state == "blocked":
        err(f"BLOCKED by pr-self-review: {msg}\n{HUMAN_HOW}\n(emergency bypass: git push --no-verify)")
        return 1

    if os.environ.get("PR_SELF_REVIEW_AUTO", "1") == "0":
        err(f"BLOCKED by pr-self-review: {msg}\nRun /pr-self-review in Claude Code, then push again.")
        return 1
    if not shutil.which("claude"):
        err(f"BLOCKED by pr-self-review: {msg}\n`claude` CLI not found, so the review can't run automatically. "
            "Run /pr-self-review in Claude Code, then push again.")
        return 1

    code = headless_review(root)
    state, msg = gate_state(root)
    if state == "ok":
        err(msg)
        return 0
    if code != 0:
        err(f"pr-self-review: the automatic review failed (exit {code}).")
    err(f"BLOCKED by pr-self-review: {msg}\n{HUMAN_HOW}\n(emergency bypass: git push --no-verify)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
