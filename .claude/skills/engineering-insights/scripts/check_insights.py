#!/usr/bin/env python3
"""Validate INSIGHTS.md files against the engineering-insights format.

Usage:
  check_insights.py [--allow-rewrite] [FILE ...]

With no FILE, checks every <package>/INSIGHTS.md at the repo root.
Exit 0 = clean (warnings allowed), 1 = errors found.

Checks (deterministic, so the model doesn't have to self-police them):
  - the 7 fixed sections exist, in order, with nothing outside them
  - every ### entry: "### YYYY-MM-DD — title" + Insight / Rule / Evidence
  - Session Notes / Open Questions: "- YYYY-MM-DD — ..." one-liners
  - no obvious secrets (API keys, tokens, private keys, inline passwords)
  - append-only: `git diff HEAD` shows no removed lines
    (skipped for untracked files; disable with --allow-rewrite in
    consolidation mode)
  - size: warn above MAX_ENTRIES. Past ~100 bullets the learnings sources
    report the signal-to-noise ratio dropping, so that is when to consolidate.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

SECTIONS = [
    "What Works",
    "What Doesn't Work",
    "Codebase Patterns",
    "Tool & Library Notes",
    "Recurring Errors & Fixes",
    "Session Notes",
    "Open Questions",
]
ONE_LINER_SECTIONS = {"Session Notes", "Open Questions"}
ENTRY_FIELDS = ("**Insight:**", "**Rule:**", "**Evidence:**")
MAX_ENTRIES = 100

DATE = r"\d{4}-\d{2}-\d{2}"
ENTRY_RE = re.compile(rf"^### (\[REVIEW NEEDED\] )?{DATE} — \S.*$")
ONE_LINER_RE = re.compile(rf"^- {DATE} — \S.*$")
SECRET_RES = [
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),            # OpenAI/Anthropic-style keys
    re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"),       # GitHub tokens
    re.compile(r"AKIA[0-9A-Z]{16}"),                 # AWS access key id
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)(password|passwd|secret|token)\s*[:=]\s*['\"]?[^\s'\"`]{8,}"),
]


def repo_root() -> Path:
    out = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True
    )
    return Path(out.stdout.strip()) if out.returncode == 0 else Path.cwd()


def strip_fences(lines: list[str]) -> list[tuple[int, str]]:
    """Return (lineno, text) pairs outside ``` fenced blocks."""
    kept, in_fence = [], False
    for i, line in enumerate(lines, 1):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence:
            kept.append((i, line))
    return kept


def check_structure(path: Path, errors: list[str], warnings: list[str]) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    body = strip_fences(lines)

    found = [(n, l[3:].strip()) for n, l in body if l.startswith("## ")]
    names = [name for _, name in found]
    if names != SECTIONS:
        missing = [s for s in SECTIONS if s not in names]
        extra = [s for s in names if s not in SECTIONS]
        msg = "sections must be exactly, in order: " + " · ".join(SECTIONS)
        if missing:
            msg += f" | missing: {missing}"
        if extra:
            msg += f" | unexpected: {extra}"
        errors.append(f"{path}: {msg}")
        return

    # Walk each section's content.
    bounds = [n for n, _ in found] + [len(lines) + 1]
    entries = 0
    for idx, (start, name) in enumerate(found):
        chunk = [(n, l) for n, l in body if start < n < bounds[idx + 1]]
        if name in ONE_LINER_SECTIONS:
            for n, l in chunk:
                if l.strip() and not ONE_LINER_RE.match(l) and not l.startswith(">"):
                    errors.append(f"{path}:{n}: [{name}] expected '- YYYY-MM-DD — …', got: {l.strip()[:60]}")
                elif ONE_LINER_RE.match(l):
                    entries += 1
            continue
        current: tuple[int, list[str]] | None = None
        blocks: list[tuple[int, list[str]]] = []
        for n, l in chunk:
            if l.startswith("### "):
                if not ENTRY_RE.match(l):
                    errors.append(f"{path}:{n}: entry heading must be '### YYYY-MM-DD — title', got: {l.strip()[:60]}")
                current = (n, [])
                blocks.append(current)
            elif current is not None:
                current[1].append(l)
            elif l.strip():
                errors.append(f"{path}:{n}: [{name}] text outside an entry: {l.strip()[:60]}")
        for n, text in blocks:
            entries += 1
            joined = "\n".join(text)
            for field in ENTRY_FIELDS:
                if field not in joined:
                    errors.append(f"{path}:{n}: entry missing {field}")
    if entries > MAX_ENTRIES:
        warnings.append(f"{path}: {entries} entries (> {MAX_ENTRIES}) — run consolidation mode")

    for n, l in enumerate(lines, 1):
        for rx in SECRET_RES:
            if rx.search(l):
                errors.append(f"{path}:{n}: looks like a secret — reference it by name only")
                break


def check_append_only(path: Path, errors: list[str]) -> None:
    tracked = subprocess.run(
        ["git", "ls-files", "--error-unmatch", str(path)],
        capture_output=True, text=True, cwd=path.parent,
    )
    if tracked.returncode != 0:
        return  # new file: nothing to compare against
    diff = subprocess.run(
        ["git", "diff", "-U0", "HEAD", "--", path.name],
        capture_output=True, text=True, cwd=path.parent,
    ).stdout
    removed = [l for l in diff.splitlines() if l.startswith("-") and not l.startswith("---")]
    if removed:
        errors.append(
            f"{path}: {len(removed)} line(s) removed/changed vs HEAD — INSIGHTS.md is append-only "
            "(add a '> **Superseded YYYY-MM-DD:**' note instead; use --allow-rewrite only in consolidation mode). "
            f"First: {removed[0][:80]}"
        )


def main(argv: list[str]) -> int:
    allow_rewrite = "--allow-rewrite" in argv
    files = [Path(a).resolve() for a in argv if not a.startswith("--")]
    if not files:
        files = sorted(repo_root().glob("*/INSIGHTS.md"))
    if not files:
        print("no INSIGHTS.md files found")
        return 1

    errors: list[str] = []
    warnings: list[str] = []
    for f in files:
        if not f.exists():
            errors.append(f"{f}: not found")
            continue
        check_structure(f, errors, warnings)
        if not allow_rewrite:
            check_append_only(f, errors)

    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    if not errors:
        print(f"OK    {len(files)} file(s) valid")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
