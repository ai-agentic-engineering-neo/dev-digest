#!/usr/bin/env sh
# Local helper for humans: list likely-flaky patterns in test files.
# DevDigest NEVER reads or runs this file on import — the archive importer only
# decodes SKILL.md and lists this script under ignored_files as "executable".
set -eu
root="${1:-.}"
grep -rnE "setTimeout\(|sleep\(|delay\(|Date\.now\(\)|new Date\(\)|Math\.random\(\)" \
  --include='*.test.ts' --include='*.spec.ts' --include='*.test.js' "$root" || true
