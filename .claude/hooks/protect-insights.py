#!/usr/bin/env python3
"""PreToolUse guard: INSIGHTS.md and INSIGHTS-<domain>.md files may only grow.

- Write to an existing INSIGHTS.md            → denied (would replace the file)
- Edit whose new_string drops any of old_string → denied (only insertions allowed)
- Bash that redirects/moves/deletes/edits in place an INSIGHTS.md → denied,
  except the skill's insert-only writer (insights.py)
Exit 2 = deny; stderr is shown to Claude as the reason.
"""
import json
import os
import re
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # never break tool calls on malformed input

tool = data.get("tool_name", "")
inp = data.get("tool_input") or {}
HOW = "Add entries/comments with .claude/skills/engineering-insights/scripts/insights.py (insert-only)."


def deny(reason):
    print(f"Blocked: {reason} INSIGHTS.md is append-only. {HOW}", file=sys.stderr)
    sys.exit(2)


NAME_RE = re.compile(r"^INSIGHTS(-[a-z0-9]+(-[a-z0-9]+)*)?\.md$")


def is_insights(path):
    return bool(NAME_RE.match(os.path.basename(path or "")))


def keeps(old, new):
    return old in new  # pure insertion keeps the old text intact


if tool == "Write" and is_insights(inp.get("file_path")) and os.path.exists(inp["file_path"]):
    deny("Write would replace the whole file.")

if tool == "Edit" and is_insights(inp.get("file_path")):
    if not keeps(inp.get("old_string", ""), inp.get("new_string", "")):
        deny("this Edit removes or changes existing text.")

if tool == "MultiEdit" and is_insights(inp.get("file_path")):
    for e in inp.get("edits") or []:
        if not keeps(e.get("old_string", ""), e.get("new_string", "")):
            deny("an edit removes or changes existing text.")

if tool == "Bash":
    cmd = inp.get("command", "")
    if re.search(r"INSIGHTS(-[a-z0-9-]+)?\.md", cmd) and "insights.py" not in cmd:
        if re.search(r">|\btee\b|\bsed\s+-i|\bperl\s+-[a-z]*i|\brm\b|\bmv\b|\bcp\b|\btruncate\b|open\(", cmd):
            deny("this shell command could overwrite or delete the file.")

sys.exit(0)
