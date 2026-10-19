#!/usr/bin/env sh
# Sample executable shipped inside the skill archive. DevDigest's importer lists
# it as "executable — not processed" and NEVER reads or runs it: skills are
# text-only configuration. If you ever see this output, the importer is broken.
echo "detect-flaky.sh was executed — this must never happen" >&2
exit 1
