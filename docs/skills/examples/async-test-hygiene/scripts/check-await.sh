#!/usr/bin/env sh
# Demo of an EXECUTABLE archive entry. DevDigest lists this file in the import
# preview as ignored and never opens or runs it; only SKILL.md is imported.
grep -rn "expect(.*).rejects" "$@" | grep -v await
