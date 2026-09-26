#!/usr/bin/env bash
# Run a command WITHOUT this machine's real provider keys.
#
#   scripts/hermetic.sh pnpm exec vitest run .it.test        (from server/)
#
# Why: the server reads secrets from ~/.devdigest/secrets.json and then from the
# environment (server/src/adapters/secrets/local.ts). A test that does not
# override `secrets` / `llm.<provider>` therefore reaches the REAL provider on a
# developer machine that stores keys — billed calls, and slow runs that time out
# (server/INSIGHTS.md, 2026-09-24). CI has no keys, so it never notices.
#
# How: a throwaway HOME under $TMPDIR (so ~/.devdigest/secrets.json is not
# found) and the provider / GitHub variables set to the EMPTY STRING, not
# unset. `env -u VAR` removes VAR from the environment `"$@"` starts with —
# but `server/src/platform/config.ts` does `import 'dotenv/config'` on every
# process start, and dotenv only sets a variable that is not ALREADY present in
# `process.env`; an unset variable is exactly that, so dotenv reloads it
# straight out of `server/.env` and undoes the `-u`. Setting it to `''`
# instead keeps the variable present (dotenv leaves it alone), and every
# consumer (`LocalSecretsProvider.get`, `Container.buildLlm`/`.github`) checks
# the secret with a truthiness test (`if (!key)`), so `''` is still treated as
# "not configured".
# Three things still have to work with a different HOME:
#   - node is an asdf shim → ASDF_DATA_DIR points at the real ~/.asdf, and the
#     real ~/.tool-versions is copied (this repo has no .tool-versions of its own);
#   - Docker Desktop's socket lives under the real HOME → DOCKER_HOST is resolved
#     from the current docker context BEFORE HOME changes, and testcontainers is
#     told the in-VM socket path for its reaper.
# The only file this script writes is its fake HOME under $TMPDIR.
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "usage: scripts/hermetic.sh <command> [args...]" >&2
  exit 2
fi

REAL_HOME=$HOME
FAKE_HOME="${TMPDIR:-/tmp}/devdigest-hermetic-home"
mkdir -p "$FAKE_HOME"
if [ -f "$REAL_HOME/.tool-versions" ]; then
  cp "$REAL_HOME/.tool-versions" "$FAKE_HOME/.tool-versions"
fi
export ASDF_DATA_DIR="${ASDF_DATA_DIR:-$REAL_HOME/.asdf}"

if [ -z "${DOCKER_HOST:-}" ] && command -v docker >/dev/null 2>&1; then
  DOCKER_ENDPOINT=$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)
  if [ -n "$DOCKER_ENDPOINT" ]; then
    export DOCKER_HOST="$DOCKER_ENDPOINT"
    case "$DOCKER_ENDPOINT" in
      unix:///var/run/docker.sock) ;;
      unix://*) export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE="${TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE:-/var/run/docker.sock}" ;;
    esac
  fi
fi

exec env \
  OPENROUTER_API_KEY= OPENAI_API_KEY= ANTHROPIC_API_KEY= \
  GITHUB_TOKEN= GITHUB_PAT= \
  HOME="$FAKE_HOME" \
  "$@"
