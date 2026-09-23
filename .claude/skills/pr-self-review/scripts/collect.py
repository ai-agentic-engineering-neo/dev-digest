#!/usr/bin/env python3
"""Collect the branch's changed files and route them to review skills.

Deterministic half of the `pr-self-review` skill (docs/pr-self-review-plan.md §3–4.1):
no model is involved, so the same working tree always produces the same plan.

    python3 .claude/skills/pr-self-review/scripts/collect.py [--base <ref>]
                                                            [--staged-only]
                                                            [--skill <name>]
                                                            [--json]

Output (JSON on stdout):
    {
      "base": "<merge-base sha>",
      "fingerprint": "<tree hash>",       # any edit changes it → a stale verdict dies
      "files": ["client/src/…", …],       # reviewable files, excludes applied
      "skills": {"react-best-practices": ["client/src/…", …], …},
      "packages": ["client", "server"],
      "gates": ["client:typecheck", "server:arch:check", …],
      "warnings": ["unrouted skill: foo", …],
      "skipped": ["design/x.png", …]
    }
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
REPO = SKILL_DIR.parent.parent.parent
ROUTING = SKILL_DIR / "routing.json"

# Packages that own a typecheck/lint script; order is the report order.
PACKAGES = ["client", "server", "reviewer-core", "e2e"]


def git(*args: str, cwd: Path = REPO, env: dict[str, str] | None = None) -> str:
    out = subprocess.run(
        ["git", *args],
        cwd=cwd,
        env={**os.environ, **(env or {})},
        capture_output=True,
        text=True,
        check=False,
    )
    if out.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {out.stderr.strip()}")
    return out.stdout


def matches(path: str, patterns: list[str]) -> bool:
    """fnmatch with '**' semantics: `a/**` matches anything under a/."""
    for pat in patterns:
        if fnmatch.fnmatch(path, pat):
            return True
        # `a/**` should also match `a/b`; fnmatch handles that, but `**/x.ts`
        # must match a top-level `x.ts` too.
        if pat.startswith("**/") and fnmatch.fnmatch(path, pat[3:]):
            return True
    return False


def merge_base(base_ref: str) -> str:
    try:
        return git("merge-base", base_ref, "HEAD").strip()
    except SystemExit:
        # No origin/main (fresh clone, detached CI) → fall back to HEAD's parent.
        return git("rev-parse", "HEAD").strip()


def _names(*args: str) -> set[str]:
    """NUL-separated git output → set of paths (file names may contain spaces)."""
    return {n for n in git(*args, "-z").split("\0") if n}


def changed_files(base: str, staged_only: bool) -> list[str]:
    """Committed-since-base + staged + unstaged + untracked, de-duplicated."""
    if staged_only:
        return sorted(_names("diff", "--name-only", "--cached"))
    names = _names("diff", "--name-only", f"{base}...HEAD")
    names |= _names("diff", "--name-only", "HEAD")
    names |= _names("diff", "--name-only", "--cached")
    names |= _names("ls-files", "--others", "--exclude-standard")
    return sorted(names)


def fingerprint(base: str) -> str:
    """hash(merge-base + tree of the working copy) — changes on any edit."""
    with tempfile.NamedTemporaryFile(prefix="prsr-index-") as tmp:
        env = {"GIT_INDEX_FILE": tmp.name}
        git("read-tree", "HEAD", env=env)
        git("add", "-A", env=env)
        tree = git("write-tree", env=env).strip()
    return f"{base[:12]}-{tree[:12]}"


def known_skills() -> list[str]:
    return sorted(p.parent.name for p in (REPO / ".claude/skills").glob("*/SKILL.md"))


def route(files: list[str], cfg: dict) -> tuple[dict[str, list[str]], list[str]]:
    """Path rules + content rules → {skill: [files]}; returns (skills, skipped)."""
    skills: dict[str, list[str]] = {}
    skipped: list[str] = []
    reviewable: list[str] = []

    for path in files:
        if matches(path, cfg["exclude"]):
            skipped.append(path)
            continue
        reviewable.append(path)

    for rule in cfg["rules"]:
        for path in reviewable:
            if not matches(path, rule["include"]):
                continue
            if matches(path, rule.get("exclude", [])):
                continue
            for skill in rule["skills"]:
                skills.setdefault(skill, [])
                if path not in skills[skill]:
                    skills[skill].append(path)

    for rule in cfg.get("content_rules", []):
        pattern = re.compile(rule["pattern"])
        for path in reviewable:
            if not matches(path, rule["include"]):
                continue
            blob = REPO / path
            if not blob.is_file():
                continue
            try:
                text = blob.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if pattern.search(text):
                for skill in rule["skills"]:
                    skills.setdefault(skill, [])
                    if path not in skills[skill]:
                        skills[skill].append(path)

    return {k: sorted(v) for k, v in sorted(skills.items())}, skipped


def packages_of(files: list[str]) -> list[str]:
    touched = {f.split("/", 1)[0] for f in files if "/" in f}
    return [p for p in PACKAGES if p in touched]


def gates_for(packages: list[str], files: list[str], cfg: dict) -> list[str]:
    """Deterministic checks to run (plan §4 step 2) — cheap, no LLM."""
    gates: list[str] = []
    for pkg in packages:
        gates.append(f"{pkg}:typecheck")
        gates.append(f"{pkg}:lint")
    if "server" in packages or "reviewer-core" in packages:
        gates.append("server:arch:check")
    if any(matches(f, cfg["drift_check"]["include"]) for f in files):
        gates.append("repo:check-shared-drift")
    if any(f.startswith("server/src/db/schema") for f in files) and not any(
        f.startswith("server/src/db/migrations/") and f.endswith(".sql") for f in files
    ):
        gates.append("server:missing-migration")
    gates.append("repo:secret-scan")
    return gates


def unrouted(skills_in_play: dict[str, list[str]], cfg: dict) -> list[str]:
    """A skill that exists but no rule can ever route to it (plan §3)."""
    routed = {s for rule in cfg["rules"] for s in rule["skills"]}
    routed |= {s for rule in cfg.get("content_rules", []) for s in rule["skills"]}
    ignored = set(cfg["no_review"]["skills"])
    return [s for s in known_skills() if s not in routed and s not in ignored]


def main() -> int:
    ap = argparse.ArgumentParser(description="Route the branch diff to review skills.")
    ap.add_argument("--base", default="origin/main", help="base ref (default: origin/main)")
    ap.add_argument("--staged-only", action="store_true", help="review only staged changes")
    ap.add_argument("--skill", help="restrict the plan to one skill")
    ap.add_argument("--json", action="store_true", help="JSON only (default: JSON)")
    args = ap.parse_args()

    cfg = json.loads(ROUTING.read_text(encoding="utf-8"))
    base = merge_base(args.base)
    files = changed_files(base, args.staged_only)
    skills, skipped = route(files, cfg)
    if args.skill:
        skills = {k: v for k, v in skills.items() if k == args.skill}

    reviewable = sorted({f for fs in skills.values() for f in fs} | {f for f in files if f not in skipped})
    warnings = [f"unrouted skill: {s}" for s in unrouted(skills, cfg)]
    if not files:
        warnings.append("no changes against the base ref")

    print(
        json.dumps(
            {
                "base": base,
                "fingerprint": fingerprint(base),
                "files": reviewable,
                "skills": skills,
                "packages": packages_of(reviewable),
                "gates": gates_for(packages_of(reviewable), reviewable, cfg),
                "warnings": warnings,
                "skipped": skipped,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
