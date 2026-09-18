# Emits one TSV line per hunk: <path>\t<new start>\t<new end>
# A finding whose start_line falls outside every hunk of its file is ungrounded.
/^\+\+\+ / { path = substr($0, 7); if (path == "/dev/null") path = ""; next }
/^--- /    { next }
/^@@ /     {
             match($0, /\+[0-9]+(,[0-9]+)?/)
             spec = substr($0, RSTART + 1, RLENGTH - 1)
             split(spec, a, ",")
             start = a[1] + 0
             len = (2 in a) ? a[2] + 0 : 1
             if (path != "" && len > 0) print path "\t" start "\t" (start + len - 1)
             next
           }
