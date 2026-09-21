#!/usr/bin/env python3
"""Hook driver for the `engineering-insights` skill (see CLAUDE.md).

  engineering-insights.py prompt   # UserPromptSubmit: READ reminder + session baseline
  engineering-insights.py stop     # Stop: demand WRAP-UP when package files changed

Stop blocks (once per new change set) only when files under the packages
changed since the last snapshot. INSIGHTS.md edits don't count, and neither does
committing content that was already seen. Any internal error lets Claude
proceed: this hook must never trap a session.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile

PACKAGES = ("server", "client", "reviewer-core", "e2e")
STATE_DIR = os.path.join(tempfile.gettempdir(), "claude-engineering-insights")

READ_REMINDER = (
    "engineering-insights READ (CLAUDE.md): if this request touches server/, client/, "
    "reviewer-core/ or e2e/, read that package's INSIGHTS.md before planning or editing "
    "and say in one line which entries apply (or `INSIGHTS: nothing relevant`)."
)


def git(root, *args):
    return subprocess.run(
        ["git", "-C", root, *args], capture_output=True, text=True, check=False
    ).stdout


def counts(path):
    return path.split("/", 1)[0] in PACKAGES and not path.endswith("/INSIGHTS.md")


def snapshot(root):
    """HEAD + content hash of every dirty/untracked package file."""
    head = git(root, "rev-parse", "HEAD").strip()
    paths = set(git(root, "diff", "HEAD", "--name-only", "--", *PACKAGES).split("\n"))
    paths |= set(git(root, "ls-files", "-o", "--exclude-standard", "--", *PACKAGES).split("\n"))
    dirty = {}
    for p in sorted(x for x in paths if x and counts(x)):
        full = os.path.join(root, p)
        if os.path.isfile(full):
            with open(full, "rb") as f:
                dirty[p] = hashlib.sha1(f.read()).hexdigest()
        else:
            dirty[p] = "deleted"
    return {"head": head, "dirty": dirty}


def content(root, snap, path):
    """Effective content id of `path` in a snapshot: working copy if dirty, else HEAD."""
    if path in snap["dirty"]:
        return snap["dirty"][path]
    blob = git(root, "cat-file", "-p", f"{snap['head']}:{path}") if snap["head"] else ""
    return hashlib.sha1(blob.encode()).hexdigest() if blob else "deleted"


def changed_packages(root, old, new):
    candidates = set(old["dirty"]) | set(new["dirty"])
    if old["head"] and new["head"] and old["head"] != new["head"]:
        candidates |= set(
            git(root, "diff", "--name-only", old["head"], new["head"], "--", *PACKAGES).split("\n")
        )
    return sorted(
        {p.split("/", 1)[0] for p in candidates
         if p and counts(p) and content(root, old, p) != content(root, new, p)}
    )


def state_path(session_id):
    os.makedirs(STATE_DIR, exist_ok=True)
    safe = "".join(c for c in session_id if c.isalnum() or c in "-_") or "default"
    return os.path.join(STATE_DIR, f"{safe}.json")


def load(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def save(path, snap):
    with open(path, "w") as f:
        json.dump(snap, f)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    payload = json.load(sys.stdin)
    root = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    state = state_path(payload.get("session_id", ""))

    if mode == "prompt":
        if load(state) is None:
            save(state, snapshot(root))  # baseline: only changes from here on count
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit", "additionalContext": READ_REMINDER}}))
        return

    if mode == "stop":
        if payload.get("stop_hook_active"):
            return  # already continuing because of this hook: let it stop
        new = snapshot(root)
        old = load(state)
        save(state, new)  # one WRAP-UP per change set, never a loop
        pkgs = changed_packages(root, old, new) if old else []
        if not pkgs:
            return
        files = ", ".join(f"{p}/INSIGHTS.md" for p in pkgs)
        print(json.dumps({"decision": "block", "reason": (
            f"engineering-insights WRAP-UP (CLAUDE.md): this work changed {', '.join(pkgs)}. "
            f"Run the `engineering-insights` skill, step WRAP-UP: re-read {files}, append only "
            "new, verified, non-obvious insights via its append_insight.py script, then run "
            "`verify`. If nothing qualifies, reply `Insights: nothing new worth recording — "
            "<reason>` and stop.")}))


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 — a hook bug must never block the session
        sys.exit(0)
