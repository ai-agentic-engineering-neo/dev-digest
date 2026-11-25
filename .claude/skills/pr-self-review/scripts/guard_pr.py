#!/usr/bin/env python3
"""Gate: no push / PR / merge without a fresh, non-blocked pr-self-review report.

Modes:
  (default)    Claude Code PreToolUse hook. Reads hook JSON on stdin, inspects
               Bash commands `gh pr create`, `gh pr merge`, `git push`.
               Blocks with exit 2; stderr goes back to Claude.
  --git-hook   git pre-push hook (scripts/git-hooks/pre-push). Exit 1 blocks.
  --check      print the gate status for the current branch, exit 0/1.

The gate passes when the report for the current branch exists, its diff_hash
matches the current working tree and its verdict is "pass".
Branch deletes and tag-only pushes are never gated.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

GATED = re.compile(r"(?:^|[;&|(]\s*|\s)(gh\s+pr\s+(?:create|merge)|git\s+(?:-C\s+\S+\s+)?push)\b")
UNGATED_PUSH = re.compile(r"git\s+(?:-C\s+\S+\s+)?push\b[^;&|]*\s(--delete|-d|--tags|--dry-run|-n)\b")
HOW = ("Do not ask the user: invoke the pr-self-review skill now. If its verdict is pass, retry "
       "this exact command. If it is blocked, show the CRITICAL findings and offer fixes. "
       "Only the user may dismiss a finding: "
       "python3 .claude/skills/pr-self-review/scripts/write_report.py dismiss --id <id> --reason '...'")
HUMAN_HOW = ("Fix the CRITICAL findings (or ask Claude: /pr-self-review), then push again. "
             "A wrong finding: python3 .claude/skills/pr-self-review/scripts/write_report.py "
             "dismiss --id <id> --reason '...'")


def gate_state(root: Path | None = None) -> tuple[str, str]:
    """-> (state, message); state is ok | missing | stale | blocked."""
    from common import collect_diff, current_branch, load_json, repo_root, report_path
    root = root or repo_root()
    branch = current_branch(root)
    report = load_json(report_path(root, branch))
    diff = collect_diff(root, report.get("base") if report else None)
    if not diff.files:
        return "ok", "no changes vs base"
    if not report:
        return "missing", f"no pr-self-review report for branch '{branch}'"
    if report.get("diff_hash") != diff.diff_hash:
        return "stale", f"report for '{branch}' is stale: the code changed after the last review"
    if report.get("verdict") != "pass":
        c = report.get("counts", {})
        crit = [f for f in report.get("findings", []) if f["severity"] == "CRITICAL" and not f.get("dismissed")]
        lines = [f"  [{f['id']}] {f.get('file') or '-'}:{f.get('line') or ''} {f['rule']}" for f in crit[:10]]
        return "blocked", f"pr-self-review found {c.get('CRITICAL', len(crit))} CRITICAL finding(s):\n" + "\n".join(lines)
    return "ok", f"pr-self-review passed for '{branch}' ({report['diff_hash'][:12]})"


def gate_status(root: Path | None = None) -> tuple[bool, str]:
    state, msg = gate_state(root)
    return state == "ok", msg


HEREDOC_RX = re.compile(r"<<-?\s*(['\"]?)(\w+)\1[^\n]*\n.*?\n\s*\2\b", re.S)
QUOTED_RX = re.compile(r"'[^']*'|\"(?:\\.|[^\"\\])*\"")
COMMENT_RX = re.compile(r"(?:^|(?<=\s))#[^\n]*")
SEGMENT_RX = re.compile(r"&&|\|\||[;|\n]")


def _code_only(cmd: str) -> str:
    """Drop heredoc bodies, quoted strings and comments: text there is data, not a command."""
    return COMMENT_RX.sub(" ", QUOTED_RX.sub("''", HEREDOC_RX.sub(" ", cmd)))


def is_gated(cmd: str) -> bool:
    for seg in SEGMENT_RX.split(_code_only(cmd)):
        if GATED.search(seg) and not UNGATED_PUSH.search(seg):
            return True
    return False


def hook_mode() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    if data.get("tool_name") != "Bash":
        sys.exit(0)
    cmd = (data.get("tool_input") or {}).get("command", "")
    if not is_gated(cmd):
        sys.exit(0)
    try:
        ok, msg = gate_status(Path(data["cwd"]) if data.get("cwd") else None)
    except Exception as e:  # never brick the session on a broken repo state
        print(f"pr-self-review guard skipped: {e}", file=sys.stderr)
        sys.exit(0)
    if not ok:
        print(f"BLOCKED by pr-self-review: {msg}\n{HOW}", file=sys.stderr)
        sys.exit(2)
    sys.exit(0)


def main() -> None:
    if "--git-hook" in sys.argv or "--check" in sys.argv:
        try:
            ok, msg = gate_status()
        except Exception as e:
            print(f"pr-self-review: gate error ({e}); allowing", file=sys.stderr)
            sys.exit(0)
        print(("" if ok else "BLOCKED by pr-self-review: ") + msg, file=sys.stderr if not ok else sys.stdout)
        if not ok:
            print(HUMAN_HOW + "\n(bypass for an emergency: git push --no-verify)", file=sys.stderr)
        sys.exit(0 if ok else 1)
    hook_mode()


if __name__ == "__main__":
    main()
