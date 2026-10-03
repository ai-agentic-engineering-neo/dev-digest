#!/usr/bin/env bash
# Quiet, scoped verification for one package — the gate agents run instead of a
# raw `pnpm test`. Prints one PASS/FAIL line per gate and, on failure, only the
# tail of that gate's output, so a green run costs a few lines of context.
#
#   scripts/verify.sh <server|client|reviewer-core> [--full] [file ...]
#
# Default (scoped) mode — what an implementor runs after its step:
#   typecheck · server layer rules for the changed files · `vitest related`
#   on the changed files (hermetic only, `*.it.test.ts` excluded).
# --full — what the orchestrating session runs once, after all steps land:
#   typecheck · server layer rules · the whole unit lane · the integration lane
#   (server only, needs Docker).
#
# Files may be given relative to the repo root or to the package. With none,
# the package's uncommitted + untracked changes are used.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAIL_LINES="${VERIFY_TAIL:-40}"

usage() {
  echo "usage: scripts/verify.sh <server|client|reviewer-core> [--full] [file ...]" >&2
  exit 64
}

PKG="${1:-}"; shift || true
case "$PKG" in
  server|client) PM=pnpm ;;
  reviewer-core) PM=npm ;;
  *) usage ;;
esac

FULL=0
FILES=()
for arg in "$@"; do
  case "$arg" in
    --full) FULL=1 ;;
    -h|--help) usage ;;
    *) FILES+=("${arg#"$PKG"/}") ;;
  esac
done

cd "$ROOT/$PKG" || exit 1

if [ "${#FILES[@]}" -eq 0 ]; then
  while IFS= read -r f; do
    [ -n "$f" ] && FILES+=("$f")
  done < <(
    { git diff --name-only --relative HEAD -- .
      git ls-files --others --exclude-standard -- .
    } | sort -u
  )
fi

# Only existing TS sources feed typecheck-adjacent gates; deleted files and
# docs are ignored.
SRC=()
for f in "${FILES[@]+"${FILES[@]}"}"; do
  case "$f" in
    *.ts|*.tsx|*.mts|*.cts) [ -f "$f" ] && SRC+=("$f") ;;
  esac
done

FAILED=0
OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

gate() { # gate <name> <command...>
  local name="$1"; shift
  if "$@" >"$OUT" 2>&1; then
    echo "PASS $name"
  else
    echo "FAIL $name"
    tail -n "$TAIL_LINES" "$OUT" | sed 's/^/  /'
    FAILED=1
  fi
}

skip() { echo "SKIP $1 — $2"; }

# --- typecheck -------------------------------------------------------------
if [ "$PM" = pnpm ]; then gate typecheck pnpm -s typecheck
else gate typecheck npm run -s typecheck; fi

# --- layer rules (server only) ---------------------------------------------
# main already carries known violations, so scoped mode fails only on
# violations whose source is one of the changed files.
arch_scoped() {
  pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err >"$OUT.arch" 2>&1
  local hits
  hits="$(grep -E '^\s*(error|warn)' "$OUT.arch" | grep -F -f <(printf '%s →\n' "${SRC[@]}") || true)"
  rm -f "$OUT.arch"
  [ -z "$hits" ] && return 0
  echo "$hits"
  return 1
}
if [ "$PKG" = server ]; then
  if [ "$FULL" -eq 1 ]; then
    gate arch pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err
  elif [ "${#SRC[@]}" -gt 0 ]; then
    gate arch arch_scoped
  else
    skip arch "no changed sources"
  fi
fi

# --- tests -----------------------------------------------------------------
VITEST=(npx --no-install vitest)
[ "$PM" = pnpm ] && VITEST=(pnpm exec vitest)

if [ "$FULL" -eq 1 ]; then
  gate unit-tests "${VITEST[@]}" run --exclude '**/*.it.test.ts' --reporter=dot
  if [ "$PKG" = server ]; then
    if docker info >/dev/null 2>&1; then
      gate integration-tests "${VITEST[@]}" run .it.test --reporter=dot
    else
      skip integration-tests "Docker is not running"
    fi
  fi
elif [ "${#SRC[@]}" -gt 0 ]; then
  gate related-tests "${VITEST[@]}" related "${SRC[@]}" --run \
    --exclude '**/*.it.test.ts' --passWithNoTests --reporter=dot
else
  skip related-tests "no changed sources"
fi

exit "$FAILED"
