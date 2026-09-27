#!/usr/bin/env bash
# Validates the project subagents in .claude/agents/*.md (README.md excluded).
#
#   check-agents.sh [--dir <path>] [--skip-readme] [<name>…]
#
# Per agent: frontmatter parses; name/description/model/tools present; name = file stem;
# model and permissionMode valid; tools ∩ disallowedTools = ∅; no AskUserQuestion; every
# preloaded skill exists; every hook command points at an executable script. Unless
# --skip-readme: README.md has a catalog row for the agent and its Model column matches.
# When both reviewers exist, their `Finding fields:` lines must be identical.
#
# Needs python3 with PyYAML (exit 3 otherwise). Exit 1 on any FAIL.
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[[ -n "$ROOT" ]] || { echo "check-agents.sh: not inside the repository" >&2; exit 3; }
DIR="$ROOT/.claude/agents"
SKIP_README=0
NAMES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --skip-readme) SKIP_README=1; shift ;;
    -*) echo "check-agents.sh: unknown argument $1" >&2; exit 64 ;;
    *) NAMES+=("$1"); shift ;;
  esac
done

python3 -c 'import yaml' 2>/dev/null \
  || { echo "check-agents.sh: needs python3 with PyYAML (pip install pyyaml)" >&2; exit 3; }

exec python3 - "$ROOT" "$DIR" "$SKIP_README" "${NAMES[@]}" <<'PY'
import os, re, sys, yaml

root, agents_dir, skip_readme, *only = sys.argv[1:]
skip_readme = skip_readme == "1"
MODELS = {"opus", "sonnet", "haiku", "fable", "inherit"}
MODES = {"default", "manual", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions"}
REVIEWERS = ("architecture-reviewer", "security-reviewer")

def as_list(v):
    if v is None:
        return []
    if isinstance(v, str):
        return [t.strip() for t in v.split(",") if t.strip()]
    return [str(t).strip() for t in v]

def tool_name(t):
    return t.split("(", 1)[0].strip()

readme_rows = {}
readme_path = os.path.join(agents_dir, "README.md")
if os.path.exists(readme_path):
    for line in open(readme_path, encoding="utf-8"):
        m = re.match(r"^\|\s*\[([a-z0-9-]+)\]\(\1\.md\)\s*\|", line)
        if m:
            readme_rows[m.group(1)] = [c.strip() for c in line.strip().strip("|").split("|")]

files = sorted(f for f in os.listdir(agents_dir) if f.endswith(".md") and f != "README.md")
if only:
    missing = [n for n in only if f"{n}.md" not in files]
    files = [f"{n}.md" for n in only if f"{n}.md" in files]
else:
    missing = []

failed = 0
finding_lines = {}

def fail(name, reason):
    global failed
    failed += 1
    print(f"FAIL {name}: {reason}")

for n in missing:
    fail(n, "no such agent file")

for f in files:
    stem = f[:-3]
    text = open(os.path.join(agents_dir, f), encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        fail(stem, "no frontmatter block"); continue
    try:
        fm = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError as e:
        fail(stem, f"frontmatter is not valid YAML: {e}"); continue

    problems = []
    for key in ("name", "description", "model", "tools"):
        if not fm.get(key):
            problems.append(f"missing {key}")
    if fm.get("name") and fm["name"] != stem:
        problems.append(f"name '{fm['name']}' differs from the file name")
    if fm.get("model") and fm["model"] not in MODELS and not str(fm["model"]).startswith("claude-"):
        problems.append(f"model '{fm['model']}' is not one of {sorted(MODELS)}")
    if "permissionMode" in fm and fm["permissionMode"] not in MODES:
        problems.append(f"permissionMode '{fm['permissionMode']}' is not valid")
    tools = {tool_name(t) for t in as_list(fm.get("tools"))}
    denied = {tool_name(t) for t in as_list(fm.get("disallowedTools"))}
    if tools & denied:
        problems.append(f"tools and disallowedTools overlap: {sorted(tools & denied)}")
    if "AskUserQuestion" in tools:
        problems.append("AskUserQuestion is stripped from every subagent")
    for skill in as_list(fm.get("skills")):
        if not os.path.isfile(os.path.join(root, ".claude/skills", skill, "SKILL.md")):
            problems.append(f"preloaded skill '{skill}' has no .claude/skills/{skill}/SKILL.md")
    for event, matchers in (fm.get("hooks") or {}).items():
        for matcher in matchers or []:
            for hook in matcher.get("hooks") or []:
                cmd = hook.get("command", "")
                m2 = re.match(r'^\s*"?([^"\s]+)"?', cmd.replace("$CLAUDE_PROJECT_DIR", root).replace("${CLAUDE_PROJECT_DIR}", root))
                script = m2.group(1) if m2 else ""
                if not (script and os.path.isfile(script) and os.access(script, os.X_OK)):
                    problems.append(f"{event} hook command does not resolve to an executable script: {cmd}")

    if not skip_readme:
        row = readme_rows.get(stem)
        if row is None:
            problems.append("no catalog row in README.md")
        elif len(row) < 3 or row[2] != fm.get("model"):
            problems.append(f"README.md Model column '{row[2] if len(row) > 2 else '?'}' differs from frontmatter '{fm.get('model')}'")

    if stem in REVIEWERS:
        lines = [l for l in text.splitlines() if l.startswith("Finding fields:")]
        if len(lines) != 1:
            problems.append("needs exactly one line starting with 'Finding fields:'")
        else:
            finding_lines[stem] = lines[0]

    if problems:
        for p in problems:
            fail(stem, p)
    else:
        print(f"ok {stem}")

if len(finding_lines) == 2 and len(set(finding_lines.values())) != 1:
    fail("reviewers", "the 'Finding fields:' lines of architecture-reviewer and security-reviewer differ")

sys.exit(1 if failed else 0)
PY
