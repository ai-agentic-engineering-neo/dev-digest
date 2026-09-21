#!/usr/bin/env python3
"""Append-only writer for <package>/INSIGHTS.md.

  append_insight.py add <package> "<Section>" "<entry text>"   # adds one dated bullet
  append_insight.py dupes <package> "<entry text>"              # lists similar existing bullets
  append_insight.py verify <package>                            # no line removed vs git HEAD

Guarantees for `add`: the file is only ever grown — the new bullet is inserted as the
first bullet of <Section>; every pre-existing line is checked to still be present, in
order, before the file is written. Refuses near-duplicates (exit 3) and unknown sections.
"""
import datetime
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PACKAGES = ("server", "client", "reviewer-core", "e2e")
SECTIONS = (
    "What Works",
    "What Doesn't Work",
    "Codebase Patterns",
    "Tool & Library Notes",
    "Recurring Errors & Fixes",
    "Session Notes",
    "Open Questions",
)
# Share of the new entry's words already present in one existing bullet.
DUPLICATE_THRESHOLD = 0.6
STOPWORDS = set("a an the to of in on for and or is are be it this that with as at by from not use".split())


def fail(code, msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def insights_path(package):
    if package not in PACKAGES:
        fail(2, f"unknown package '{package}', expected one of {', '.join(PACKAGES)}")
    path = ROOT / package / "INSIGHTS.md"
    if not path.is_file():
        fail(2, f"{path} not found")
    return path


def words(text):
    text = re.sub(r"^\s*-\s*\d{4}-\d{2}-\d{2}\s*[—-]\s*", "", text)
    return {w for w in re.findall(r"[a-z0-9_./-]{2,}", text.lower()) if w not in STOPWORDS}


def similar_bullets(lines, entry):
    new = words(entry)
    if not new:
        return []
    hits = []
    for line in lines:
        if line.lstrip().startswith("- "):
            overlap = len(new & words(line)) / len(new)
            if overlap >= DUPLICATE_THRESHOLD:
                hits.append((overlap, line.strip()))
    return sorted(hits, reverse=True)


def is_subsequence(old, new):
    it = iter(new)
    return all(any(line == candidate for candidate in it) for line in old)


def cmd_add(package, section, entry):
    if section not in SECTIONS:
        fail(2, f"unknown section '{section}', expected one of: {'; '.join(SECTIONS)}")
    entry = " ".join(entry.split())
    if not entry:
        fail(2, "empty entry")
    path = insights_path(package)
    old = path.read_text(encoding="utf-8").splitlines()

    dupes = similar_bullets(old, entry)
    if dupes:
        print("DUPLICATE? Not written. Similar existing entries:")
        for score, line in dupes:
            print(f"  {score:.0%}  {line}")
        sys.exit(3)

    try:
        header = old.index(f"## {section}")
    except ValueError:
        fail(2, f"section '## {section}' missing in {path} — restore the template, don't improvise")
    insert_at = header + 1
    while insert_at < len(old) and old[insert_at].lstrip().startswith("<!--"):
        insert_at += 1

    bullet = f"- {datetime.date.today().isoformat()} — {entry}"
    new = old[:insert_at] + [bullet] + old[insert_at:]
    if not is_subsequence(old, new) or len(new) != len(old) + 1:
        fail(4, "safety check failed: an existing line would change — nothing written")
    path.write_text("\n".join(new) + "\n", encoding="utf-8")
    print(f"ADDED to {package}/INSIGHTS.md › {section}:\n{bullet}")


def cmd_dupes(package, entry):
    hits = similar_bullets(insights_path(package).read_text(encoding="utf-8").splitlines(), entry)
    for score, line in hits:
        print(f"{score:.0%}  {line}")
    if not hits:
        print("no similar entries")


def cmd_verify(package):
    path = insights_path(package)
    rel = path.relative_to(ROOT).as_posix()
    try:
        head = subprocess.run(["git", "-C", str(ROOT), "show", f"HEAD:{rel}"],
                              capture_output=True, text=True, check=True).stdout.splitlines()
    except subprocess.CalledProcessError:
        print(f"OK: {rel} not in HEAD yet — nothing to compare")
        return
    now = path.read_text(encoding="utf-8").splitlines()
    missing = [line for line in head if line not in now]
    if missing or not is_subsequence(head, now):
        print(f"VIOLATION: {rel} lost or reordered committed lines:")
        for line in missing:
            print(f"  - {line}")
        print(f"Restore with: git checkout HEAD -- {rel}  (then re-add only the new bullets)")
        sys.exit(5)
    print(f"OK: {rel} only grew (+{len(now) - len(head)} lines vs HEAD)")


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) == 4 and args[0] == "add":
        cmd_add(*args[1:])
    elif len(args) == 3 and args[0] == "dupes":
        cmd_dupes(*args[1:])
    elif len(args) == 2 and args[0] == "verify":
        cmd_verify(args[1])
    else:
        print(__doc__)
        sys.exit(2)
