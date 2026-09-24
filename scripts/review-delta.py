#!/usr/bin/env python3
"""Snapshot the branch's changed files so the next review round sees only the delta.

  scripts/review-delta.sh save <label>     # after a round: remember every changed file's hash
  scripts/review-delta.sh diff <label>     # before the next round: what changed since <label>
  scripts/review-delta.sh diff <label> --patch   # the same, as a diff of those files vs base

Works without commits: the snapshot is the content hash of every file that differs from
the base (tracked diff + untracked), stored in .devdigest/review/<label>.json. `diff`
prints one `<status> <path>` per line: M (changed again), A (newly changed),
R (back to the base version or deleted since the snapshot).
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, ".devdigest", "review")


def git(*args):
    return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True, check=False).stdout


def default_base():
    return git("merge-base", "HEAD", "main").strip() or "HEAD"


def snapshot(base):
    paths = set(git("diff", "--name-only", base).split("\n"))
    paths |= set(git("ls-files", "-o", "--exclude-standard").split("\n"))
    files = {}
    for p in sorted(x for x in paths if x):
        full = os.path.join(ROOT, p)
        if os.path.isfile(full):
            with open(full, "rb") as f:
                files[p] = hashlib.sha256(f.read()).hexdigest()
        else:
            files[p] = "deleted"
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=("save", "diff"))
    ap.add_argument("label")
    ap.add_argument("--base", help="base ref; default: merge-base with main")
    ap.add_argument("--patch", action="store_true", help="diff: print the changed files' diff vs base")
    args = ap.parse_args()
    if not args.label.replace("-", "").replace("_", "").isalnum():
        print("label: letters, digits, '-' and '_' only", file=sys.stderr)
        return 2
    path = os.path.join(OUT_DIR, f"{args.label}.json")

    if args.cmd == "save":
        base = args.base or default_base()
        os.makedirs(OUT_DIR, exist_ok=True)
        files = snapshot(base)
        with open(path, "w") as f:
            json.dump({"base": base, "head": git("rev-parse", "HEAD").strip(), "files": files}, f, indent=2)
        print(f"saved {len(files)} changed files as '{args.label}' (base {base[:10]})")
        return 0

    try:
        with open(path) as f:
            saved = json.load(f)
    except (OSError, ValueError):
        print(f"no snapshot '{args.label}' in {os.path.relpath(OUT_DIR, ROOT)}", file=sys.stderr)
        return 2
    base = args.base or saved["base"]
    old, new = saved["files"], snapshot(base)
    delta = []
    for p in sorted(set(old) | set(new)):
        if p not in new:
            delta.append(("R", p))
        elif p not in old:
            delta.append(("A", p))
        elif old[p] != new[p]:
            delta.append(("M", p))
    if args.patch:
        tracked = [p for s, p in delta if s != "A" or git("ls-files", p).strip()]
        sys.stdout.write(git("diff", base, "--", *tracked) if tracked else "")
        for s, p in delta:
            if s == "A" and not git("ls-files", p).strip():
                print(f"--- untracked file: {p} (read it whole)")
        return 0
    for s, p in delta:
        print(f"{s} {p}")
    if not delta:
        print(f"no changes since '{args.label}'", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
