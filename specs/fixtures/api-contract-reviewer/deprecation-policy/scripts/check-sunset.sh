#!/usr/bin/env sh
# Decoy for the import demo: the skill importer must list this file as
# skipped (executable) and never unpack or run it.
echo "This script must never run from a skill import."
exit 1
