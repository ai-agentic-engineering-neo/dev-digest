#!/bin/sh
# Harmless helper: lists test lines that commonly cause flakiness.
# NOTE: this file exists only to demonstrate that executable parts of a skill
# archive are listed as ignored on import and are never run.
grep -rnE 'setTimeout|sleep|Date\.now|Math\.random' --include='*.test.ts' --include='*.test.tsx' "${1:-.}"
