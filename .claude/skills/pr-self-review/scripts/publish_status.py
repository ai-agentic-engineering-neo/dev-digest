#!/usr/bin/env python3
"""Optional: publish the report verdict as a GitHub commit status on HEAD.

Usage: publish_status.py [--context pr-self-review]

Posts state=success|failure to repos/:owner/:repo/statuses/<head_sha> via `gh api`.
Make the `pr-self-review` context a required status check in branch protection
for `main` to turn the local verdict into a real merge block. It is a guardrail,
not a security control: anyone with push rights can post a status.
Refuses to publish a stale report (diff changed) or one with uncommitted changes,
because the status must describe exactly the pushed commit.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import collect_diff, current_branch, git, load_json, repo_root, report_path  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--context", default="pr-self-review")
    args = ap.parse_args()

    if not shutil.which("gh"):
        raise SystemExit("gh CLI not installed (brew install gh && gh auth login)")
    root = repo_root()
    report = load_json(report_path(root, current_branch(root)))
    if not report:
        raise SystemExit("no report for this branch")
    if collect_diff(root, report["base"]).diff_hash != report["diff_hash"]:
        raise SystemExit("report is stale; re-run the review first")
    if git("status", "--porcelain", "--untracked-files=no", cwd=root).strip():
        raise SystemExit("uncommitted changes: commit first so the status matches the pushed commit")

    c = report["counts"]
    state = "success" if report["verdict"] == "pass" else "failure"
    desc = f"{c['CRITICAL']} critical, {c['WARNING']} warning, {c['dismissed']} dismissed"
    sha = git("rev-parse", "HEAD", cwd=root).strip()
    res = subprocess.run(["gh", "api", "--method", "POST", f"repos/{{owner}}/{{repo}}/statuses/{sha}",
                          "-f", f"state={state}", "-f", f"context={args.context}", "-f", f"description={desc}"],
                         cwd=root, capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"gh api failed: {res.stderr.strip()}")
    print(f"status {args.context}={state} on {sha[:12]} ({desc})")


if __name__ == "__main__":
    main()
