#!/usr/bin/env python3
"""Insert-only writer for INSIGHTS.md / INSIGHTS-<domain>.md files (engineering-insights skill).

  insights.py add     <file> <section> "- YYYY-MM-DD · entry"
  insights.py comment <file> "<unique text of the entry>" "YYYY-MM-DD · kind: comment"
  insights.py init    <dir>/INSIGHTS-<domain>.md "<title>"      # create a new domain file

Guarantees: add/comment insert exactly one line. Before writing, the script checks
that every original line is still present, in order; otherwise it aborts without
touching the file. Writes are atomic. init never overwrites an existing file.
Exit codes: 0 written / already present, 1 refused (nothing changed).
"""
import os
import re
import sys
import tempfile

SECTIONS = ["Patterns", "Mistakes", "Decisions", "Context", "Open Questions", "Review log"]
KINDS = ("confirmed", "extended", "contradicted", "obsolete", "moved")
NAME_RE = re.compile(r"^INSIGHTS(-[a-z0-9]+(-[a-z0-9]+)*)?\.md$")
ENTRY_RE = re.compile(r"^- \d{4}-\d{2}-\d{2} · \S")
COMMENT_RE = re.compile(r"^  - \d{4}-\d{2}-\d{2} · (%s): \S" % "|".join(KINDS))

TEMPLATE = """# Insights — {title}

Non-obvious findings for agents working in {title}, written via the `engineering-insights` skill.
Treat entries as high-confidence guidance unless the user says otherwise; if the code contradicts an entry, the code wins — add a `contradicted` comment.
Add only: new entries go last in their section; comments go as indented sub-bullets under the entry they refer to.
Format: `` - YYYY-MM-DD · <insight> — <why>. Evidence: `path` (`symbol`) `` — no line numbers.

""" + "\n\n".join(f"## {s}" for s in SECTIONS) + "\n"


def fail(msg):
    print(f"refused: {msg} (file unchanged)", file=sys.stderr)
    sys.exit(1)


def check_name(path):
    if not NAME_RE.match(os.path.basename(path)):
        fail(f"{path} is not an INSIGHTS.md or INSIGHTS-<domain>.md file")


def read_lines(path):
    check_name(path)
    if not os.path.isfile(path):
        fail(f"{path} does not exist")
    with open(path, encoding="utf-8") as f:
        return f.read().split("\n")


def is_subsequence(old, new):
    it = iter(new)
    return all(any(line == n for n in it) for line in old)


def atomic_write(path, text):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)), prefix=".insights-")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def safe_write(path, old, new):
    if len(new) != len(old) + 1 or not is_subsequence(old, new):
        fail("integrity check failed: the result would not keep every existing line")
    atomic_write(path, "\n".join(new))
    if read_lines(path) != new:
        fail("post-write verification failed — inspect the file with git diff")


def add(path, section, text):
    if section not in SECTIONS:
        fail(f"unknown section {section!r}; use one of {SECTIONS}")
    if "\n" in text or not ENTRY_RE.match(text):
        fail('entry must be one line starting with "- YYYY-MM-DD · "')
    lines = read_lines(path)
    if text in lines:
        print("already present — nothing written")
        return
    try:
        start = lines.index(f"## {section}")
    except ValueError:
        fail(f'section "## {section}" not found')
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    insert_at = start + 1
    for i in range(start + 1, end):  # after the last non-blank line of the section
        if lines[i].strip():
            insert_at = i + 1
    safe_write(path, lines, lines[:insert_at] + [text] + lines[insert_at:])
    print(f"added to {path} › {section}")


def comment(path, match, text):
    text = text.strip()
    text = "  - " + (text[2:] if text.startswith("- ") else text)
    if "\n" in text or not COMMENT_RE.match(text):
        fail('comment must be one line "YYYY-MM-DD · %s: …"' % "|".join(KINDS))
    lines = read_lines(path)
    if text in lines:
        print("already present — nothing written")
        return
    hits = [i for i, l in enumerate(lines) if l.startswith("- ") and match in l]
    if len(hits) != 1:
        fail(f"match text must identify exactly one entry, found {len(hits)}")
    insert_at = hits[0] + 1
    while insert_at < len(lines) and lines[insert_at].startswith("  "):
        insert_at += 1  # after existing comments of this entry
    safe_write(path, lines, lines[:insert_at] + [text] + lines[insert_at:])
    print(f"commented in {path} under entry at line {hits[0] + 1}")


def init(path, title):
    check_name(path)
    if os.path.basename(path) == "INSIGHTS.md":
        fail("init only creates domain files (INSIGHTS-<domain>.md)")
    if os.path.exists(path):
        fail(f"{path} already exists")
    if not os.path.isdir(os.path.dirname(os.path.abspath(path))):
        fail("target directory does not exist")
    atomic_write(path, TEMPLATE.format(title=title))
    print(f"created {path}")


def main(argv):
    if len(argv) == 4 and argv[0] == "add":
        add(argv[1], argv[2], argv[3])
    elif len(argv) == 4 and argv[0] == "comment":
        comment(argv[1], argv[2], argv[3])
    elif len(argv) == 3 and argv[0] == "init":
        init(argv[1], argv[2])
    else:
        print(__doc__, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
