#!/usr/bin/env python3
"""PreToolUse guard: makes existing INSIGHTS.md content impossible to overwrite.

Registered by the engineering-insights skill's frontmatter `hooks`. Reads the
hook JSON on stdin. To block, it exits 2 and the stderr text goes back to Claude.

Blocks:
  - Write onto an existing INSIGHTS.md (a full-file overwrite)
  - Edit / MultiEdit on INSIGHTS.md whose new_string does not contain its
    old_string, i.e. anything other than a pure insertion
  - Bash that rewrites INSIGHTS.md (> redirect, sed -i, perl -i, mv, cp,
    rm, truncate, tee without -a, git checkout/restore)
Allows everything else, including append_insight.py, check_insights.py,
reads, and `>>` appends.
"""
from __future__ import annotations

import json
import os
import re
import sys

NAME = "INSIGHTS.md"
HOW = ("INSIGHTS.md is append-only. Use: python3 \"$CLAUDE_PROJECT_DIR\"/.claude/skills/"
       "engineering-insights/scripts/append_insight.py <file> --section '<Section>' (new entry) "
       "or --under '<entry title>' (comment on an existing entry). "
       "Consolidation: write a proposal to INSIGHTS.proposed.md and let the user replace the file.")

DESTRUCTIVE_BASH = [
    re.compile(r"(?<![>\d&])>(?!>)\s*['\"]?[^\s;|&]*INSIGHTS\.md"),   # > file (not >>)
    re.compile(r"\b(sed|perl)\b[^|;&]*\s-[a-zA-Z]*i[^|;&]*INSIGHTS\.md"),
    re.compile(r"\b(mv|rm|truncate|dd)\b[^|;&]*INSIGHTS\.md"),          # move away / delete
    re.compile(r"\b(cp|install|rsync)\b[^|;&]*\s['\"]?\S*INSIGHTS\.md['\"]?\s*($|[;|&])"),  # copy ONTO it
    re.compile(r"\btee\b(?![^|;&]*\s-a)[^|;&]*INSIGHTS\.md"),
    re.compile(r"\bgit\s+(checkout|restore|reset|stash)\b[^|;&]*INSIGHTS\.md"),
]


def block(reason: str) -> None:
    print(f"BLOCKED by engineering-insights guard: {reason}\n{HOW}", file=sys.stderr)
    sys.exit(2)


def is_insights(path: str | None) -> bool:
    return bool(path) and os.path.basename(path) == NAME


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # never break the session on unexpected input
    tool = data.get("tool_name", "")
    ti = data.get("tool_input") or {}

    if tool == "Write" and is_insights(ti.get("file_path")):
        if os.path.exists(ti["file_path"]):
            block("Write would overwrite the whole existing INSIGHTS.md")
    elif tool == "Edit" and is_insights(ti.get("file_path")):
        old, new = ti.get("old_string", ""), ti.get("new_string", "")
        if not old or old not in new:
            block("Edit removes or changes existing text (only pure insertions are allowed)")
    elif tool == "MultiEdit" and is_insights(ti.get("file_path")):
        for e in ti.get("edits") or []:
            o, n = e.get("old_string", ""), e.get("new_string", "")
            if not o or o not in n:
                block("MultiEdit removes or changes existing text")
    elif tool == "Bash":
        cmd = ti.get("command", "")
        if NAME in cmd and "append_insight.py" not in cmd:
            for rx in DESTRUCTIVE_BASH:
                if rx.search(cmd):
                    block(f"shell command would rewrite INSIGHTS.md: {cmd[:80]}")
    sys.exit(0)


if __name__ == "__main__":
    main()
