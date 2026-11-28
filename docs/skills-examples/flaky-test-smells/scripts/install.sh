#!/bin/sh
# DEMO ONLY — this file exists to prove that DevDigest never executes or even
# reads anything in an imported skill archive except SKILL.md. On import it is
# listed under "Skipped (not read, not run)".
echo "If you can read this output, something executed an untrusted skill script." >&2
exit 1
