#!/usr/bin/env python3
"""Step 3 of pr-self-review: deterministic checks (no LLM).

Usage: run_checks.py [--plan PATH] [--mode full|quick]

Reads the plan written by route_skills.py and writes findings to
.devdigest/self-review/<branch>.checks.json. Checks:
  secrets    provider-shaped keys on added lines          CRITICAL (generic -> WARNING)
  contracts  scripts/check-contracts.sh when vendor/shared changed   CRITICAL
  i18n       t("key") on added lines missing from messages/en/<ns>.json   CRITICAL
  tests      package source changed but no test changed in it        WARNING
  typecheck  tsc in touched packages (full only); errors in changed files CRITICAL
  lint       eslint on changed client files (full only)              WARNING
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (branch_slug, current_branch, is_test_file, load_json, repo_root,  # noqa: E402
                    state_dir, write_json)

SECRET_RULES = [
    ("aws-access-key", r"\bAKIA[0-9A-Z]{16}\b", "CRITICAL"),
    ("github-token", r"\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b", "CRITICAL"),
    ("anthropic-key", r"\bsk-ant-[A-Za-z0-9_-]{20,}", "CRITICAL"),
    ("openai-key", r"\bsk-(proj-)?[A-Za-z0-9]{32,}\b", "CRITICAL"),
    ("slack-token", r"\bxox[baprs]-[A-Za-z0-9-]{10,}", "CRITICAL"),
    ("private-key", r"-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----", "CRITICAL"),
    ("generic-secret",
     r"(?i)\b(api[_-]?key|secret|token|passw(or)?d)\b\s*[:=]\s*['\"][A-Za-z0-9_\-+/=]{16,}['\"]", "WARNING"),
]
TS_ERROR_RX = re.compile(r"^(?P<file>[^\s(][^(]*)\((?P<line>\d+),(?P<col>\d+)\): error (?P<code>TS\d+): (?P<msg>.*)$")
T_DECL_RX = re.compile(r"const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*['\"]([\w-]+)['\"]\s*\)")


def finding(check: str, rule: str, file: str | None, line: int | None, severity: str,
            evidence: str, fix: str) -> dict:
    return {"source": f"check:{check}", "rule": rule, "file": file, "line": line,
            "severity": severity, "confidence": "high", "verified": True,
            "evidence": evidence.strip()[:400], "fix": fix}


def check_secrets(root: Path, plan: dict, added: dict[str, dict[int, str]]) -> list[dict]:
    out = []
    for path, lines in added.items():
        for n, text in lines.items():
            for rule, rx, sev in SECRET_RULES:
                if re.search(rx, text):
                    out.append(finding("secrets", rule, path, n, sev, "<redacted: matches " + rule + ">",
                                       "Remove the secret, rotate it, load it via LocalSecretsProvider / env."))
                    break
    return out


def check_contracts(root: Path, plan: dict) -> list[dict]:
    if not any("/src/vendor/shared/" in f["path"] for f in plan["files"]):
        return []
    script = root / "scripts" / "check-contracts.sh"
    if not script.is_file():
        return []
    res = subprocess.run(["bash", str(script)], cwd=root, capture_output=True, text=True)
    if res.returncode == 0:
        return []
    return [finding("contracts", "vendor/shared copies differ", None, None, "CRITICAL",
                    res.stdout[-400:] or res.stderr[-400:],
                    "Apply the same change to server/src/vendor/shared and client/src/vendor/shared.")]


def _has_key(messages: dict, key: str) -> bool:
    cur = messages
    for part in key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return False
        cur = cur[part]
    return True


def check_i18n(root: Path, plan: dict, added: dict[str, dict[int, str]]) -> list[dict]:
    out = []
    msg_dir = root / "client" / "messages" / "en"
    for path, lines in added.items():
        if not (path.startswith("client/src/") and path.endswith((".ts", ".tsx"))):
            continue
        try:
            text = (root / path).read_text(encoding="utf-8")
        except OSError:
            continue
        translators = dict(T_DECL_RX.findall(text))
        for var, ns in translators.items():
            ns_file = msg_dir / f"{ns}.json"
            messages = load_json(ns_file, None)
            call_rx = re.compile(rf"(?<![\w.]){re.escape(var)}(?:\.(?:rich|markup|raw|has))?\(\s*['\"]([\w.-]+)['\"]")
            for n, line in lines.items():
                for key in call_rx.findall(line):
                    if messages is None:
                        out.append(finding("i18n", "namespace file missing", path, n, "CRITICAL",
                                           f'{var}("{key}") uses namespace "{ns}"',
                                           f"Create client/messages/en/{ns}.json."))
                    elif not _has_key(messages, key):
                        out.append(finding("i18n", "missing translation key", path, n, "CRITICAL",
                                           f'"{ns}.{key}" not found in client/messages/en/{ns}.json',
                                           "Add the key to the messages file (or fix the typo)."))
    return out


def check_tests(plan: dict) -> list[dict]:
    out = []
    by_pkg: dict[str, dict[str, list[str]]] = {}
    for f in plan["files"]:
        pkg = f.get("package")
        if not pkg or pkg == "e2e" or f["status"] == "D" or not f["path"].endswith((".ts", ".tsx")):
            continue
        bucket = by_pkg.setdefault(pkg, {"src": [], "tests": []})
        if is_test_file(f["path"]):
            bucket["tests"].append(f["path"])
        elif "/src/" in f["path"] and "/vendor/" not in f["path"]:
            bucket["src"].append(f["path"])
    for pkg, b in by_pkg.items():
        if b["src"] and not b["tests"]:
            out.append(finding("tests", "source changed without a test change", None, None, "WARNING",
                               f"{pkg}: {len(b['src'])} source file(s) changed, e.g. {b['src'][0]}",
                               f"Add or update a test in {pkg}/ (see TESTING.md for what is worth testing)."))
    return out


def run_tsc(root: Path, pkg: str, changed: set[str]) -> list[dict]:
    pkg_dir = root / pkg
    tsc = pkg_dir / "node_modules" / ".bin" / "tsc"
    if not tsc.exists():
        return [finding("typecheck", "skipped", None, None, "SUGGESTION",
                        f"{pkg}: node_modules missing, typecheck not run", f"Install deps in {pkg}/.")]
    try:
        res = subprocess.run([str(tsc), "--noEmit", "-p", "tsconfig.json", "--pretty", "false"],
                             cwd=pkg_dir, capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        return [finding("typecheck", "timeout", None, None, "WARNING", f"{pkg}: tsc timed out", "Run it manually.")]
    if res.returncode == 0:
        return []
    out, other = [], 0
    for line in res.stdout.splitlines():
        m = TS_ERROR_RX.match(line.strip())
        if not m:
            continue
        rel = (pkg_dir / m["file"]).resolve().relative_to(root.resolve()).as_posix() \
            if (pkg_dir / m["file"]).resolve().is_relative_to(root.resolve()) else m["file"]
        if rel in changed:
            out.append(finding("typecheck", m["code"], rel, int(m["line"]), "CRITICAL", m["msg"],
                               "Fix the type error."))
        else:
            other += 1
    if other:
        out.append(finding("typecheck", "errors outside the diff", None, None, "WARNING",
                           f"{pkg}: {other} type error(s) in files this diff does not touch",
                           f"Run `tsc --noEmit` in {pkg}/; may be pre-existing or caused indirectly."))
    return out


def run_eslint(root: Path, files: list[str], added: dict[str, dict[int, str]]) -> list[dict]:
    pkg_dir = root / "client"
    eslint = pkg_dir / "node_modules" / ".bin" / "eslint"
    if not eslint.exists() or not files or not (pkg_dir / "eslint.config.mjs").exists():
        return []
    rel = [f[len("client/"):] for f in files]
    try:
        res = subprocess.run([str(eslint), "--format", "json", *rel], cwd=pkg_dir,
                             capture_output=True, text=True, timeout=300)
        report = json.loads(res.stdout or "[]")
    except (subprocess.TimeoutExpired, json.JSONDecodeError):
        return []
    out = []
    for r in report:
        path = Path(r["filePath"]).resolve().relative_to(root.resolve()).as_posix()
        for m in r.get("messages", []):
            if m.get("severity") == 2 and m.get("line") in added.get(path, {}):
                out.append(finding("lint", m.get("ruleId") or "eslint", path, m["line"], "WARNING",
                                   m.get("message", ""), "Fix the lint error."))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan")
    ap.add_argument("--mode", choices=["full", "quick"])
    args = ap.parse_args()

    root = repo_root()
    slug = branch_slug(current_branch(root))
    plan_path = Path(args.plan) if args.plan else state_dir(root) / f"{slug}.plan.json"
    plan = load_json(plan_path)
    if not plan:
        raise SystemExit(f"plan not found: {plan_path} (run route_skills.py first)")
    mode = args.mode or plan["mode"]

    from common import collect_diff
    diff = collect_diff(root, plan["base"])
    added = {f.path: f.added_text for f in diff.files if f.added_text}
    changed = {f.path for f in diff.files if f.status != "D"}

    findings = check_secrets(root, plan, added) + check_contracts(root, plan) + \
        check_i18n(root, plan, added) + check_tests(plan)
    ran = ["secrets", "contracts", "i18n", "tests"]
    if mode == "full":
        for pkg in plan["packages"]:
            if pkg in ("server", "client", "reviewer-core") and (root / pkg / "tsconfig.json").is_file():
                findings += run_tsc(root, pkg, changed)
        client_files = [p for p in changed if p.startswith("client/") and p.endswith((".ts", ".tsx", ".mjs"))]
        findings += run_eslint(root, client_files, added)
        ran += ["typecheck", "lint"]

    out = state_dir(root) / f"{slug}.checks.json"
    write_json(out, {"diff_hash": plan["diff_hash"], "checks": ran, "findings": findings})
    crit = sum(f["severity"] == "CRITICAL" for f in findings)
    print(f"checks: {', '.join(ran)} · {len(findings)} finding(s), {crit} CRITICAL")
    for f in findings:
        loc = f"{f['file']}:{f['line']}" if f["file"] else "-"
        print(f"  {f['severity']:<10} {f['source']:<16} {loc}  {f['rule']}")
    print(f"CHECKS {out}")


if __name__ == "__main__":
    main()
