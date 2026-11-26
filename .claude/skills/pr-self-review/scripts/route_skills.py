#!/usr/bin/env python3
"""Step 1-2 of pr-self-review: collect the local diff and build the run plan.

Usage: route_skills.py [--base REF] [--mode full|quick] [--no-cache]

Maps every changed file to review sources via routing.json, groups them into
one subagent job per group, marks (file, group) pairs whose findings are
already cached, and writes the plan to .devdigest/self-review/<branch>.plan.json.
Prints a short human summary; the plan path is on the last line.
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (SKILL_DIR, Diff, branch_slug, collect_diff, glob_match, load_json,  # noqa: E402
                    package_of, repo_root, sha256, state_dir, write_json)


def to_ranges(lines: list[int]) -> list[list[int]]:
    out: list[list[int]] = []
    for n in sorted(lines):
        if out and n == out[-1][1] + 1:
            out[-1][1] = n
        else:
            out.append([n, n])
    return out


def source_path(name: str, meta: dict) -> str:
    return meta.get("path") or f".claude/skills/{name}/SKILL.md"


def load_routing() -> dict:
    routing = load_json(SKILL_DIR / "routing.json")
    if not routing:
        raise SystemExit("routing.json missing or invalid")
    return routing


def source_index(routing: dict) -> dict[str, tuple[str, dict]]:
    """source name -> (group, meta)."""
    idx: dict[str, tuple[str, dict]] = {}
    for group, g in routing["groups"].items():
        for name, meta in g["sources"].items():
            idx[name] = (group, meta)
    return idx


def unmapped_skills(root: Path, routing: dict) -> list[str]:
    known = set(source_index(routing)) | set(routing.get("skip_skills", {}))
    skills_dir = root / ".claude" / "skills"
    found = sorted(p.parent.name for p in skills_dir.glob("*/SKILL.md"))
    return [s for s in found if s not in known]


def route_file(root: Path, path: str, routing: dict) -> list[str]:
    sources: list[str] = []
    text: str | None = None
    for r in routing["routes"]:
        if not glob_match(path, r["glob"]):
            continue
        if "contains" in r:
            if text is None:
                try:
                    text = (root / path).read_text(encoding="utf-8")
                except (OSError, UnicodeDecodeError):
                    text = ""
            if not re.search(r["contains"], text):
                continue
        for s in r["sources"]:
            if s not in sources:
                sources.append(s)
    return sources


def build_plan(root: Path, diff: Diff, mode: str, use_cache: bool) -> dict:
    routing = load_routing()
    idx = source_index(routing)
    cache_dir = state_dir(root) / "cache"
    source_hash: dict[str, str] = {}

    def hash_source(name: str) -> str:
        if name not in source_hash:
            p = root / source_path(name, idx[name][1])
            source_hash[name] = sha256(p.read_bytes()) if p.is_file() else "missing"
        return source_hash[name]

    groups: dict[str, dict] = {}
    unrouted: list[str] = []
    files_out = []
    for cf in diff.files:
        files_out.append({**cf.to_json(), "package": package_of(cf.path),
                          "added_ranges": to_ranges(cf.added_lines)})
        if cf.status == "D" or not cf.added_lines:
            continue
        sources = route_file(root, cf.path, routing)
        if not sources:
            unrouted.append(cf.path)
            continue
        by_group: dict[str, list[str]] = {}
        for s in sources:
            if s in idx:
                by_group.setdefault(idx[s][0], []).append(s)
        for group, srcs in by_group.items():
            g = groups.setdefault(group, {"files": [], "cached_files": []})
            key = sha256("|".join([cf.path, cf.content_hash, mode,
                                   ",".join(map(str, cf.added_lines)),
                                   *[f"{s}:{hash_source(s)}" for s in sorted(srcs)]]))
            entry = {"path": cf.path, "sources": srcs, "added_ranges": to_ranges(cf.added_lines),
                     "cache_key": key}
            if use_cache and (cache_dir / f"{key}.json").is_file():
                g["cached_files"].append(entry)
            else:
                g["files"].append(entry)

    for group, g in groups.items():
        meta = routing["groups"][group]
        used = sorted({s for f in g["files"] + g["cached_files"] for s in f["sources"]})
        g["title"] = meta["title"]
        g["sources"] = {s: {"path": source_path(s, meta["sources"][s]),
                            "checklist": meta["sources"][s].get("checklist", "")} for s in used}
        g["context"] = [c for c in meta.get("context", []) if (root / c).is_file()]

    warnings = []
    limits = routing.get("limits", {})
    packages = sorted({p for f in files_out if (p := package_of(f["path"]))})
    if diff.changed_line_count > limits.get("max_changed_lines", 10**9):
        warnings.append({"kind": "size", "message":
                         f"{diff.changed_line_count} changed lines (> {limits['max_changed_lines']}); "
                         "consider splitting the PR"})
    if len(packages) >= limits.get("max_packages", 10**9):
        warnings.append({"kind": "size", "message":
                         f"diff touches {len(packages)} packages ({', '.join(packages)}); consider splitting"})
    for s in unmapped_skills(root, routing):
        warnings.append({"kind": "unmapped-skill", "message":
                         f"skill '{s}' is not in routing.json (add it to a group or to skip_skills)"})

    return {
        "branch": diff.branch, "base": diff.base, "merge_base": diff.merge_base,
        "head_sha": diff.head_sha, "diff_hash": diff.diff_hash, "mode": mode,
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "packages": packages, "changed_lines": diff.changed_line_count,
        "files": files_out, "groups": groups, "unrouted_files": unrouted, "warnings": warnings,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base")
    ap.add_argument("--mode", choices=["full", "quick"], default="full")
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()

    root = repo_root()
    diff = collect_diff(root, args.base)
    plan = build_plan(root, diff, args.mode, not args.no_cache)
    out = state_dir(root) / f"{branch_slug(diff.branch)}.plan.json"
    write_json(out, plan)
    findings_dir = state_dir(root) / "findings"
    findings_dir.mkdir(parents=True, exist_ok=True)
    for old in findings_dir.glob("*.json"):
        old.unlink()

    print(f"pr-self-review plan · {diff.branch} vs {plan['base']} · mode={args.mode}")
    print(f"files: {len(plan['files'])} · changed lines: {plan['changed_lines']} · "
          f"packages: {', '.join(plan['packages']) or '-'}")
    for name, g in plan["groups"].items():
        print(f"  [{name}] review {len(g['files'])} file(s), cached {len(g['cached_files'])} · "
              f"sources: {', '.join(g['sources'])}")
    if plan["unrouted_files"]:
        print(f"  not reviewed by any skill: {len(plan['unrouted_files'])} file(s)")
    for w in plan["warnings"]:
        print(f"  WARNING ({w['kind']}): {w['message']}")
    print(f"FINDINGS_DIR {findings_dir}")
    print(f"PLAN {out}")


if __name__ == "__main__":
    main()
