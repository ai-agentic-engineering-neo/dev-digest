#!/usr/bin/env python3
"""Safely append to an INSIGHTS.md. This is the ONLY supported write path.

It reads the file, inserts the new text, and before saving proves that every
existing line is still present, unchanged and in order. If that proof fails,
nothing is written.

Usage (entry text on stdin):
  # list what is already in the file (titles per section) — read before writing
  append_insight.py FILE --show

  # new entry at the bottom of a section
  append_insight.py FILE --section "What Doesn't Work" <<'EOF'
  ### 2026-11-21 — title
  **Insight:** ...
  **Rule:** ALWAYS ... — because ...
  **Evidence:** `path` → `symbol()`
  EOF

  # one-liner for Session Notes / Open Questions
  append_insight.py FILE --section "Session Notes" <<< "- 2026-11-21 — task: outcome"

  # add a comment to an EXISTING entry (update / supersede) — never edit it
  append_insight.py FILE --under "Don't mock Drizzle" <<< "> **Update 2026-11-21:** also true for ..."

Exit codes: 0 written · 1 bad input / integrity failure (nothing written)
            · 3 possible duplicate (nothing written; re-run with --force only
              if it is genuinely a different lesson)
"""
from __future__ import annotations

import os
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_insights import (  # noqa: E402
    ENTRY_FIELDS, ENTRY_RE, ONE_LINER_RE, ONE_LINER_SECTIONS, SECRET_RES, SECTIONS,
)

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "INSIGHTS.template.md"
NOTE_RE = re.compile(r"^> \*\*(Update|Superseded) \d{4}-\d{2}-\d{2}:\*\* \S")
STOP = set("a an the to of in on for and or is are be it this that with via not no never always because use".split())
OVERLAP = 0.6  # share of a new title's key words already in one existing title → likely duplicate


def die(msg: str, code: int = 1) -> None:
    print(f"ERROR {msg}", file=sys.stderr)
    sys.exit(code)


def fence_mask(lines: list[str]) -> list[bool]:
    """True for lines inside ``` fences (header examples), which are never anchors."""
    mask, inside = [], False
    for l in lines:
        if l.lstrip().startswith("```"):
            mask.append(True)
            inside = not inside
        else:
            mask.append(inside)
    return mask


def section_bounds(lines: list[str]) -> dict[str, tuple[int, int]]:
    mask = fence_mask(lines)
    heads = [(i, l[3:].strip()) for i, l in enumerate(lines) if not mask[i] and l.startswith("## ")]
    out = {}
    for k, (i, name) in enumerate(heads):
        end = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        out[name] = (i, end)
    return out


def words(title: str) -> set[str]:
    title = re.sub(rf"^### (\[REVIEW NEEDED\] )?\d{{4}}-\d{{2}}-\d{{2}} — ", "", title)
    return {w for w in re.findall(r"[a-z0-9_.]+", title.lower()) if w not in STOP and len(w) > 2}


def is_subsequence(old: list[str], new: list[str]) -> bool:
    it = iter(new)
    return all(any(o == n for n in it) for o in old)


def show(lines: list[str]) -> None:
    for name, (s, e) in section_bounds(lines).items():
        if name not in SECTIONS:
            continue
        items = [l.strip() for l in lines[s + 1:e]
                 if l.startswith("### ") or ONE_LINER_RE.match(l) or NOTE_RE.match(l)]
        print(f"## {name} ({sum(1 for i in items if not i.startswith('>'))})")
        for i in items:
            print(f"   {i[:110]}")


def validate_text(text: list[str], section: str | None) -> None:
    joined = "\n".join(text)
    if any(rx.search(joined) for rx in SECRET_RES):
        die("entry looks like it contains a secret — reference it by name only")
    if any(l.startswith("## ") for l in text):
        die("entry must not contain '## ' headings (sections are fixed)")
    if section is None:  # --under: comment lines
        if not all(NOTE_RE.match(l) or not l.strip() for l in text):
            die("--under accepts only '> **Update|Superseded YYYY-MM-DD:** …' lines")
        return
    if section in ONE_LINER_SECTIONS:
        if not all(ONE_LINER_RE.match(l) for l in text if l.strip()):
            die(f"[{section}] accepts only '- YYYY-MM-DD — …' lines")
        return
    heads = [l for l in text if l.startswith("### ")]
    if len(heads) != 1 or not ENTRY_RE.match(text[0]):
        die("entry must start with exactly one '### YYYY-MM-DD — title' line")
    for f in ENTRY_FIELDS:
        if f not in joined:
            die(f"entry missing {f}")
    if "because" not in joined.split("**Rule:**", 1)[1].split("**Evidence:**", 1)[0]:
        die("**Rule:** must give a reason ('— because …')")


def find_duplicate(lines: list[str], new_title: str) -> str | None:
    nw = words(new_title)
    if not nw:
        return None
    for l in lines:
        if l.startswith("### ") and ENTRY_RE.match(l):
            ow = words(l)
            if ow and len(nw & ow) / len(nw) >= OVERLAP:
                return l.strip()
    return None


def main() -> None:
    args = sys.argv[1:]
    if not args:
        die(__doc__ or "usage")
    path = Path(args[0])
    flags = args[1:]

    def opt(name: str) -> str | None:
        if name in flags:
            i = flags.index(name)
            if i + 1 >= len(flags):
                die(f"{name} needs a value")
            return flags[i + 1]
        return None

    created = False
    if not path.exists():
        if "--show" in flags:
            die(f"{path} does not exist yet")
        path.write_text(TEMPLATE.read_text(encoding="utf-8"), encoding="utf-8")
        created = True
        print(f"created {path} from template")

    original = path.read_text(encoding="utf-8")
    old = original.splitlines()

    if "--show" in flags:
        show(old)
        return

    section, under = opt("--section"), opt("--under")
    if bool(section) == bool(under):
        die("give exactly one of --section NAME or --under 'ENTRY TITLE'")
    if section and section not in SECTIONS:
        die(f"unknown section {section!r}; one of: {SECTIONS}")

    text = sys.stdin.read().strip("\n").splitlines()
    text = [l.rstrip() for l in text]
    if not any(l.strip() for l in text):
        die("empty entry on stdin")
    validate_text(text, section)

    bounds = section_bounds(old)
    if section:
        if section not in bounds:
            die(f"section '## {section}' not found — file structure is broken; fix it by hand, do not rewrite")
        if section not in ONE_LINER_SECTIONS and "--force" not in flags:
            dup = find_duplicate(old, text[0])
            if dup:
                print(f"possible duplicate of: {dup}\n"
                      f"→ add a comment to it instead:  --under \"<its title>\"  (or --force if truly different)",
                      file=sys.stderr)
                sys.exit(3)
        start, end = bounds[section]
        insert_at = end
        while insert_at - 1 > start and not old[insert_at - 1].strip():
            insert_at -= 1  # land right after the last non-blank line of the section
        # blank line after only if the next line isn't already blank
        block = [""] + text + ([""] if insert_at < len(old) and old[insert_at].strip() else [])
    else:
        target = under.strip().lower()
        hits = [i for i, l in enumerate(old) if l.startswith("### ") and target in l.lower()]
        if len(hits) != 1:
            die(f"--under matched {len(hits)} entries; give a more specific part of the title")
        i = hits[0] + 1
        while i < len(old) and old[i].strip() and not old[i].startswith(("### ", "## ")):
            i += 1  # end of that entry's block (its last non-blank line)
        insert_at = i
        block = text

    new = old[:insert_at] + block + old[insert_at:]

    # Integrity proof: nothing that existed may disappear or change.
    if not is_subsequence(old, new) or len(new) != len(old) + len(block):
        die("integrity check failed — existing content would change; nothing written")
    if new[:insert_at] != old[:insert_at] or new[insert_at + len(block):] != old[insert_at:]:
        die("integrity check failed — content around the insertion moved; nothing written")

    # Re-read right before writing: if the file changed since we read it, abort.
    if path.read_text(encoding="utf-8") != original:
        die("file changed while appending — re-run to re-read it; nothing written")

    out = "\n".join(new) + "\n"
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".INSIGHTS.", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(out)
    os.replace(tmp, path)  # atomic: either the old file or the new one, never half
    where = f"## {section}" if section else f"under '{old[hits[0]].strip()}'"
    print(f"{'created + ' if created else ''}appended {len(text)} line(s) to {path} {where}; "
          f"{len(old)} existing line(s) preserved")


if __name__ == "__main__":
    main()
