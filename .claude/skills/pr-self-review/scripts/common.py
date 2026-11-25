#!/usr/bin/env python3
"""Shared helpers for pr-self-review: git access, diff collection, hashing, paths.

Every script imports this module, so the skill run, the PreToolUse guard and
the git pre-push hook compute the SAME diff_hash for the same working tree.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
SEVERITIES = ("CRITICAL", "WARNING", "SUGGESTION")

# Never reviewed and never part of diff_hash: generated, vendored or runtime files.
EXCLUDE_GLOBS = [
    "**/pnpm-lock.yaml",
    "**/package-lock.json",
    "server/clones/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/__pycache__/**",
    "**/*.pyc",
    ".devdigest/**",
]
BINARY_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".woff", ".woff2", ".ttf"}


def git(*args: str, cwd: Path | None = None, check: bool = True) -> str:
    res = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if check and res.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {res.stderr.strip()}")
    return res.stdout


def repo_root(start: Path | None = None) -> Path:
    return Path(git("rev-parse", "--show-toplevel", cwd=start).strip())


def current_branch(root: Path) -> str:
    name = git("rev-parse", "--abbrev-ref", "HEAD", cwd=root).strip()
    return name or "HEAD"


def branch_slug(branch: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "__", branch)


def state_dir(root: Path) -> Path:
    return root / ".devdigest" / "self-review"


def report_path(root: Path, branch: str) -> Path:
    return state_dir(root) / f"{branch_slug(branch)}.json"


def resolve_base(root: Path, base: str | None) -> str:
    candidates = [base] if base else ["origin/main", "main"]
    for ref in candidates:
        if ref and git("rev-parse", "--verify", "--quiet", ref, cwd=root, check=False).strip():
            return ref
    raise RuntimeError(f"base ref not found (tried {candidates})")


_GLOB_CACHE: dict[str, re.Pattern] = {}


def glob_match(path: str, glob: str) -> bool:
    """Gitignore-style glob: `**/` = any dirs (incl. none), `**` = anything, `*` = one segment."""
    rx = _GLOB_CACHE.get(glob)
    if rx is None:
        out, i = "", 0
        while i < len(glob):
            if glob.startswith("**/", i):
                out, i = out + "(?:.*/)?", i + 3
            elif glob.startswith("**", i):
                out, i = out + ".*", i + 2
            elif glob[i] == "*":
                out, i = out + "[^/]*", i + 1
            elif glob[i] == "?":
                out, i = out + "[^/]", i + 1
            else:
                out, i = out + re.escape(glob[i]), i + 1
        rx = _GLOB_CACHE[glob] = re.compile(out + r"\Z")
    return bool(rx.match(path))


def is_excluded(path: str) -> bool:
    return any(glob_match(path, g) for g in EXCLUDE_GLOBS) or Path(path).suffix.lower() in BINARY_EXT


def sha256(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode()
    return hashlib.sha256(data).hexdigest()


@dataclass
class ChangedFile:
    path: str
    status: str                      # A (added/untracked) | M | D | R
    added_lines: list[int] = field(default_factory=list)
    added_text: dict[int, str] = field(default_factory=dict)
    content_hash: str = ""

    def to_json(self) -> dict:
        return {"path": self.path, "status": self.status, "added_lines": self.added_lines,
                "content_hash": self.content_hash}


@dataclass
class Diff:
    base: str
    merge_base: str
    head_sha: str
    branch: str
    files: list[ChangedFile]
    diff_hash: str

    @property
    def changed_line_count(self) -> int:
        return sum(len(f.added_lines) for f in self.files)

    def file(self, path: str) -> ChangedFile | None:
        return next((f for f in self.files if f.path == path), None)


HUNK_RX = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


def _parse_unified(patch: str) -> dict[str, ChangedFile]:
    files: dict[str, ChangedFile] = {}
    cur: ChangedFile | None = None
    line_no = 0
    for raw in patch.splitlines():
        if raw.startswith("diff --git "):
            cur = None
            continue
        if raw.startswith("+++ "):
            target = raw[4:].strip()
            if target == "/dev/null":
                cur = None
            else:
                path = target[2:] if target.startswith("b/") else target
                cur = files.setdefault(path, ChangedFile(path=path, status="M"))
            continue
        if raw.startswith("--- ") or cur is None:
            continue
        m = HUNK_RX.match(raw)
        if m:
            line_no = int(m.group(1))
            continue
        if raw.startswith("+"):
            cur.added_lines.append(line_no)
            cur.added_text[line_no] = raw[1:]
            line_no += 1
        elif raw.startswith("-") or raw.startswith("\\"):
            continue
        else:
            line_no += 1
    return files


def collect_diff(root: Path, base: str | None = None) -> Diff:
    """Everything local vs merge-base: branch commits + staged + unstaged + untracked."""
    base_ref = resolve_base(root, base)
    merge_base = git("merge-base", base_ref, "HEAD", cwd=root).strip()
    head_sha = git("rev-parse", "HEAD", cwd=root).strip()

    status_out = git("diff", "--name-status", "-M", merge_base, cwd=root)
    statuses: dict[str, str] = {}
    for line in status_out.splitlines():
        parts = line.split("\t")
        code = parts[0][0]
        statuses[parts[-1]] = code

    patch = git("diff", "--unified=0", "--no-color", "-M", merge_base, cwd=root)
    parsed = _parse_unified(patch)

    files: list[ChangedFile] = []
    for path, code in sorted(statuses.items()):
        if is_excluded(path):
            continue
        cf = parsed.get(path, ChangedFile(path=path, status=code))
        cf.status = code
        files.append(cf)

    untracked = git("ls-files", "--others", "--exclude-standard", cwd=root).splitlines()
    for path in sorted(untracked):
        if is_excluded(path):
            continue
        full = root / path
        if not full.is_file():
            continue
        try:
            text = full.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        lines = text.splitlines()
        cf = ChangedFile(path=path, status="A", added_lines=list(range(1, len(lines) + 1)),
                         added_text={i + 1: l for i, l in enumerate(lines)})
        files.append(cf)

    hasher = hashlib.sha256()
    for cf in sorted(files, key=lambda f: f.path):
        full = root / cf.path
        content = full.read_bytes() if full.is_file() else b"<deleted>"
        cf.content_hash = sha256(content)
        hasher.update(f"{cf.path}\0{cf.status}\0{cf.content_hash}\n".encode())

    return Diff(base=base_ref, merge_base=merge_base, head_sha=head_sha,
                branch=current_branch(root), files=files, diff_hash=hasher.hexdigest())


def package_of(path: str) -> str | None:
    top = path.split("/", 1)[0]
    return top if top in ("server", "client", "reviewer-core", "e2e") else None


def is_test_file(path: str) -> bool:
    return bool(re.search(r"\.(test|spec|it\.test)\.[cm]?[jt]sx?$", path)) or "/test/" in path or "/tests/" in path


def load_json(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)
