#!/usr/bin/env python3
"""Deterministic gates, run once per working-tree state and cached by its hash.

  scripts/gates.sh                       # gates for packages changed vs the base branch
  scripts/gates.sh --packages server,client --integration
  scripts/gates.sh --state               # print the current state hash only
  scripts/gates.sh --show                # print the cached report for this state, run nothing

The report lands in .devdigest/gates/<state>.json (+ logs in .devdigest/gates/<state>/),
and a copy in .devdigest/gates/latest.json. Agents cite the report instead of re-running
the same commands: a gate that passed for this exact state is never run twice. Failed
gates are re-run on the next call (client tests can flake under CPU load), `--force`
re-runs everything.

The state hash covers HEAD, the tracked diff and the untracked files, excluding *.md —
docs, plans, specs and INSIGHTS.md never affect a gate, so editing them keeps the cache.
Gates run sequentially on purpose (parallel runs starve the client suite).
"""
import argparse
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, ".devdigest", "gates")
PACKAGES = ("reviewer-core", "server", "client", "e2e")
NOT_MD = ":(exclude)*.md"


def git(*args, binary=False):
    res = subprocess.run(["git", "-C", ROOT, *args], capture_output=True, check=False)
    return res.stdout if binary else res.stdout.decode()


def state_hash():
    h = hashlib.sha256()
    h.update(git("rev-parse", "HEAD", binary=True))
    h.update(git("diff", "HEAD", "--binary", "--", ".", NOT_MD, binary=True))
    untracked = git("ls-files", "-o", "--exclude-standard", "-z", "--", ".", NOT_MD, binary=True)
    for path in sorted(p for p in untracked.split(b"\0") if p):
        h.update(path + b"\0")
        full = os.path.join(ROOT, path.decode())
        if os.path.isfile(full):
            with open(full, "rb") as f:
                h.update(hashlib.sha256(f.read()).digest())
    return h.hexdigest()[:16]


def default_base():
    base = git("merge-base", "HEAD", "main").strip()
    return base or "HEAD"


def changed_paths(base):
    paths = set(git("diff", "--name-only", base, "--", ".", NOT_MD).split("\n"))
    paths |= set(git("ls-files", "-o", "--exclude-standard", "--", ".", NOT_MD).split("\n"))
    return {p for p in paths if p}


def pm(pkg):
    if pkg in ("reviewer-core", "e2e"):
        return ["npm", "run"]
    return ["pnpm"] if shutil.which("pnpm") else ["npx", "-y", "pnpm@10"]


def plan_gates(packages, changed, integration):
    """(id, cwd, argv) per gate, in run order."""
    gates = [("root:drift", ROOT, ["./scripts/check-shared-drift.sh"])]
    for pkg in PACKAGES:
        if pkg not in packages:
            continue
        run = pm(pkg)
        cwd = os.path.join(ROOT, pkg)
        gates += [(f"{pkg}:typecheck", cwd, run + ["typecheck"]), (f"{pkg}:lint", cwd, run + ["lint"])]
        if pkg == "server":
            gates += [(f"{pkg}:arch", cwd, run + ["arch:check"]), (f"{pkg}:unit", cwd, run + ["test:unit"])]
            if integration:
                gates.append((f"{pkg}:integration", cwd, run + ["test:integration"]))
        elif pkg in ("reviewer-core", "client"):
            gates.append((f"{pkg}:test", cwd, run + ["test"]))
    # server consumes reviewer-core as source and pins its prompt format
    if "reviewer-core" in packages and "server" not in packages:
        cwd = os.path.join(ROOT, "server")
        gates += [
            ("server:typecheck", cwd, pm("server") + ["typecheck"]),
            ("server:prompt-callers", cwd, ["npx", "vitest", "run", "test/prompt-callers.test.ts"]),
        ]
    # a shared-contract change on the server side must still compile on the client
    if any(p.startswith("server/src/vendor/shared/") for p in changed) and "client" not in packages:
        gates.append(("client:typecheck", os.path.join(ROOT, "client"), pm("client") + ["typecheck"]))
    return gates


def docker_up():
    try:
        return subprocess.run(["docker", "info"], capture_output=True, timeout=20).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def tail(path, n=25):
    with open(path, errors="replace") as f:
        return "".join(f.readlines()[-n:])


def load(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def print_report(report, path):
    print(f"gates state {report['state']} · base {report['base'][:10]} · report {os.path.relpath(path, ROOT)}")
    for g in report["gates"].values():
        mark = "SKIP" if g["exit"] is None else ("ok  " if g["exit"] == 0 else "FAIL")
        cached = " (cached)" if g.get("cached") else ""
        print(f"  {mark} {g['id']:<24} {g['seconds']:>6.1f}s{cached}  {g.get('note', '')}".rstrip())
    failed = [g for g in report["gates"].values() if g["exit"] not in (0, None)]
    for g in failed:
        print(f"\n--- {g['id']} (exit {g['exit']}) · {g['log']}\n{g['tail']}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--packages", help="comma list; default: packages changed vs --base")
    ap.add_argument("--base", help="base ref; default: merge-base with main")
    ap.add_argument("--integration", action="store_true", help="also server test:integration (needs Docker)")
    ap.add_argument("--force", action="store_true", help="re-run gates that already passed for this state")
    ap.add_argument("--state", action="store_true", help="print the state hash and exit")
    ap.add_argument("--show", action="store_true", help="print the cached report for this state and exit")
    args = ap.parse_args()

    state = state_hash()
    if args.state:
        print(state)
        return 0
    path = os.path.join(OUT_DIR, f"{state}.json")
    report = load(path)
    if args.show:
        if not report:
            print(f"no gates report for state {state}", file=sys.stderr)
            return 2
        print_report(report, path)
        return 0 if all(g["exit"] in (0, None) for g in report["gates"].values()) else 1

    base = args.base or default_base()
    changed = changed_paths(base)
    packages = (
        [p.strip() for p in args.packages.split(",") if p.strip()]
        if args.packages
        else [p for p in PACKAGES if any(c.startswith(p + "/") for c in changed)]
    )
    report = report or {"state": state, "gates": {}}
    report.update(base=base, head=git("rev-parse", "HEAD").strip(),
                  updated_at=datetime.datetime.now().isoformat(timespec="seconds"))
    os.makedirs(os.path.join(OUT_DIR, state), exist_ok=True)

    for gid, cwd, argv in plan_gates(packages, changed, args.integration):
        prev = report["gates"].get(gid)
        if prev and prev["exit"] == 0 and not args.force:
            prev["cached"] = True
            continue
        log = os.path.join(OUT_DIR, state, gid.replace(":", ".") + ".log")
        entry = {"id": gid, "cmd": " ".join(argv), "cwd": os.path.relpath(cwd, ROOT) or ".",
                 "log": os.path.relpath(log, ROOT), "cached": False}
        if gid == "server:integration" and not docker_up():
            entry.update(exit=None, seconds=0.0, tail="", note="SKIPPED: docker is not reachable")
        else:
            start = time.time()
            with open(log, "w") as f:
                code = subprocess.run(argv, cwd=cwd, stdout=f, stderr=subprocess.STDOUT, check=False).returncode
            entry.update(exit=code, seconds=round(time.time() - start, 1), tail=tail(log) if code else "")
        report["gates"][gid] = entry

    for target in (path, os.path.join(OUT_DIR, "latest.json")):
        with open(target, "w") as f:
            json.dump(report, f, indent=2)
    if state_hash() != state:
        print(f"warning: the working tree changed while gates ran (state {state} is stale)", file=sys.stderr)
    print_report(report, path)
    return 0 if all(g["exit"] in (0, None) for g in report["gates"].values()) else 1


if __name__ == "__main__":
    sys.exit(main())
