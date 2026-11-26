#!/usr/bin/env python3
"""Steps 6-7 of pr-self-review: validate findings, apply cache + dismissals, write the report.

Usage:
  write_report.py build [--findings FILE ...]   merge checks + subagent findings -> report
  write_report.py dismiss --id ID --reason TEXT  dismiss one finding (kept across re-runs)
  write_report.py show                           print the current report summary

Findings files (from subagents) hold {"group": "<name>", "findings": [...]} or a bare list.
Each finding: source, rule, file, line, severity, confidence, verified, evidence, fix.

Rules enforced here, not by trust:
  - findings outside the added/changed lines are dropped (legacy code never blocks)
  - CRITICAL without verified=true is downgraded to WARNING
  - verdict = "blocked" iff >= 1 CRITICAL that is not dismissed
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (SEVERITIES, branch_slug, collect_diff, current_branch, load_json,  # noqa: E402
                    repo_root, report_path, sha256, state_dir, write_json)

SEVERITY_ALIASES = {"CRIT": "CRITICAL", "BLOCKER": "CRITICAL", "WARN": "WARNING", "SUGG": "SUGGESTION",
                    "INFO": "SUGGESTION", "NIT": "SUGGESTION"}
MIN_REASON = 10


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def in_ranges(line: int, ranges: list[list[int]]) -> bool:
    return any(a <= line <= b for a, b in ranges)


def fingerprint(root: Path, f: dict) -> str:
    text = ""
    if f.get("file") and f.get("line"):
        try:
            lines = (root / f["file"]).read_text(encoding="utf-8").splitlines()
            text = lines[f["line"] - 1].strip() if 0 < f["line"] <= len(lines) else ""
        except (OSError, UnicodeDecodeError):
            pass
    return sha256("|".join([f.get("source", ""), f.get("rule", ""), f.get("file") or "", text]))[:12]


def normalize(f: dict, notes: list[str]) -> dict:
    sev = str(f.get("severity", "WARNING")).upper()
    sev = SEVERITY_ALIASES.get(sev, sev)
    if sev not in SEVERITIES:
        notes.append(f"unknown severity {f.get('severity')!r} -> WARNING ({f.get('source')}: {f.get('rule')})")
        sev = "WARNING"
    out = {
        "source": f.get("source", "unknown"), "rule": f.get("rule", ""), "file": f.get("file"),
        "line": int(f["line"]) if f.get("line") not in (None, "") else None, "severity": sev,
        "confidence": f.get("confidence", "medium"), "verified": bool(f.get("verified")),
        "evidence": str(f.get("evidence", ""))[:600], "fix": str(f.get("fix", ""))[:600],
    }
    if sev == "CRITICAL" and not out["verified"]:
        out["severity"] = "WARNING"
        out["downgraded"] = "CRITICAL not verified"
    return out


def load_subagent_findings(paths: list[str]) -> list[tuple[str | None, dict]]:
    out = []
    for p in paths:
        data = load_json(Path(p))
        if data is None:
            raise SystemExit(f"cannot read findings file {p}")
        group = data.get("group") if isinstance(data, dict) else None
        items = data.get("findings", []) if isinstance(data, dict) else data
        out += [(f.get("group", group), f) for f in items]
    return out


def evaluate(report: dict, dismissals: dict) -> None:
    for f in report["findings"]:
        d = dismissals.get(f["id"])
        f["dismissed"] = d if d else None
    active = [f for f in report["findings"] if not f["dismissed"]]
    report["counts"] = {s: sum(f["severity"] == s for f in active) for s in SEVERITIES}
    report["counts"]["dismissed"] = len(report["findings"]) - len(active)
    report["verdict"] = "blocked" if report["counts"]["CRITICAL"] else "pass"


def build(args) -> None:
    root = repo_root()
    slug = branch_slug(current_branch(root))
    sd = state_dir(root)
    plan = load_json(sd / f"{slug}.plan.json")
    if not plan:
        raise SystemExit("plan not found, run route_skills.py first")
    diff = collect_diff(root, plan["base"])
    if diff.diff_hash != plan["diff_hash"]:
        raise SystemExit("the working tree changed after route_skills.py ran; re-run the review")

    ranges = {f["path"]: f["added_ranges"] for f in plan["files"]}
    source_group = {s: g for g, grp in plan["groups"].items() for s in grp["sources"]}
    notes: list[str] = []
    findings: list[dict] = []
    dropped = 0

    checks = load_json(sd / f"{slug}.checks.json", {"findings": [], "checks": []})
    if checks.get("diff_hash") not in (None, plan["diff_hash"]):
        notes.append("checks.json is stale (different diff) and was ignored; re-run run_checks.py")
        checks = {"findings": [], "checks": []}
    for f in checks["findings"]:
        findings.append({**normalize(f, notes), "group": "checks"})

    fresh_by_key: dict[str, list[dict]] = {}
    key_of = {(g, e["path"]): e["cache_key"] for g, grp in plan["groups"].items() for e in grp["files"]}
    for key in key_of.values():
        fresh_by_key[key] = []

    for group, raw in load_subagent_findings(args.findings or []):
        f = normalize(raw, notes)
        group = group or source_group.get(f["source"], "other")
        f["group"] = group
        if f["file"]:
            if f["file"] not in ranges:
                dropped += 1
                continue
            if f["line"] is not None and not in_ranges(f["line"], ranges[f["file"]]):
                dropped += 1
                continue
        findings.append(f)
        key = key_of.get((group, f["file"]))
        if key:
            fresh_by_key[key].append(f)

    cache_dir = sd / "cache"
    for key, items in fresh_by_key.items():
        write_json(cache_dir / f"{key}.json", {"findings": items, "at": now()})
    cached = 0
    for group, grp in plan["groups"].items():
        for e in grp["cached_files"]:
            data = load_json(cache_dir / f"{e['cache_key']}.json", {"findings": []})
            for f in data["findings"]:
                findings.append({**f, "group": group, "cached": True})
                cached += 1

    for f in findings:
        f["id"] = fingerprint(root, f)
    order = {s: i for i, s in enumerate(SEVERITIES)}
    findings.sort(key=lambda f: (order[f["severity"]], f.get("file") or "", f.get("line") or 0))

    report = {
        "branch": plan["branch"], "base": plan["base"], "merge_base": plan["merge_base"],
        "head_sha": diff.head_sha, "diff_hash": plan["diff_hash"], "mode": plan["mode"],
        "created_at": now(), "packages": plan["packages"], "changed_lines": plan["changed_lines"],
        "groups_run": {g: {"reviewed": len(grp["files"]), "cached": len(grp["cached_files"]),
                           "sources": list(grp["sources"])} for g, grp in plan["groups"].items()},
        "checks_run": checks.get("checks", []), "unrouted_files": plan["unrouted_files"],
        "warnings": plan["warnings"], "notes": notes,
        "dropped_off_diff": dropped, "cached_findings": cached, "findings": findings,
    }
    evaluate(report, load_json(sd / f"{slug}.dismissals.json", {}))
    save(root, report)


def save(root: Path, report: dict) -> None:
    path = report_path(root, report["branch"])
    write_json(path, report)
    path.with_suffix(".pr.md").write_text(pr_section(report), encoding="utf-8")
    print_summary(report, path)


def pr_section(r: dict) -> str:
    c = r["counts"]
    lines = ["## Self-review (`pr-self-review`)", "",
             f"- Verdict: **{r['verdict']}** · mode `{r['mode']}` · diff `{r['diff_hash'][:12]}`",
             f"- Findings: {c['CRITICAL']} critical · {c['WARNING']} warning · {c['SUGGESTION']} suggestion"
             f" · {c['dismissed']} dismissed",
             f"- Packages: {', '.join(r['packages']) or '-'} · {r['changed_lines']} changed lines",
             f"- Reviewers: {', '.join(s for g in r['groups_run'].values() for s in g['sources']) or '-'}",
             f"- Checks: {', '.join(r['checks_run']) or '-'}"]
    warn = [f for f in r["findings"] if f["severity"] == "WARNING" and not f["dismissed"]]
    if warn:
        lines += ["", "### Known warnings", ""]
        lines += [f"- `{f.get('file') or '-'}:{f.get('line') or ''}` {f['rule']} ({f['source']})" for f in warn[:15]]
    dis = [f for f in r["findings"] if f["dismissed"]]
    if dis:
        lines += ["", "### Dismissed", ""]
        lines += [f"- {f['severity']} {f['rule']} at `{f.get('file')}:{f.get('line')}` — {f['dismissed']['reason']}"
                  for f in dis]
    return "\n".join(lines) + "\n"


def print_summary(r: dict, path: Path) -> None:
    c = r["counts"]
    print(f"pr-self-review: {r['verdict'].upper()} · {c['CRITICAL']} critical · {c['WARNING']} warning · "
          f"{c['SUGGESTION']} suggestion · {c['dismissed']} dismissed")
    for f in r["findings"]:
        if f["severity"] == "CRITICAL" and not f["dismissed"]:
            print(f"  [{f['id']}] {f.get('file') or '-'}:{f.get('line') or ''}  {f['rule']}  ({f['source']})")
    if r.get("dropped_off_diff"):
        print(f"  {r['dropped_off_diff']} finding(s) outside changed lines dropped")
    for n in r.get("notes", []):
        print(f"  note: {n}")
    print(f"REPORT {path}")


def dismiss(args) -> None:
    root = repo_root()
    branch = current_branch(root)
    path = report_path(root, branch)
    report = load_json(path)
    if not report:
        raise SystemExit("no report for this branch")
    target = next((f for f in report["findings"] if f["id"] == args.id), None)
    if not target:
        raise SystemExit(f"finding {args.id} not in the report")
    if len(args.reason.strip()) < MIN_REASON:
        raise SystemExit(f"a dismissal needs a real reason (>= {MIN_REASON} chars)")
    dpath = state_dir(root) / f"{branch_slug(branch)}.dismissals.json"
    dismissals = load_json(dpath, {})
    dismissals[args.id] = {"reason": args.reason.strip(), "at": now(),
                           "severity": target["severity"], "rule": target["rule"]}
    write_json(dpath, dismissals)
    evaluate(report, dismissals)
    save(root, report)


def show(_args) -> None:
    root = repo_root()
    path = report_path(root, current_branch(root))
    report = load_json(path)
    if not report:
        raise SystemExit("no report for this branch")
    print_summary(report, path)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--findings", nargs="*")
    d = sub.add_parser("dismiss")
    d.add_argument("--id", required=True)
    d.add_argument("--reason", required=True)
    sub.add_parser("show")
    args = ap.parse_args()
    {"build": build, "dismiss": dismiss, "show": show}[args.cmd](args)


if __name__ == "__main__":
    main()
