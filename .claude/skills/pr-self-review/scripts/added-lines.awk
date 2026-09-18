# Emits one TSV line per ADDED line in a unified diff:
#   <path>\t<new-file line number>\t<content without the leading '+'>
#
# Used by hard-rules.sh (pattern checks need a real file:line) and by the
# grounding step (a finding must land on a line that appears here).
/^\+\+\+ /    { path = substr($0, 7); if (path == "/dev/null") path = ""; next }
/^--- /       { next }
/^@@ /        { match($0, /\+[0-9]+/); n = substr($0, RSTART + 1, RLENGTH - 1) + 0; next }
/^\+/         { if (path != "") { print path "\t" n "\t" substr($0, 2) } n++; next }
/^-/          { next }
/^ /          { n++; next }
