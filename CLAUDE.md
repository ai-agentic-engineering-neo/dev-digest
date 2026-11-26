@AGENTS.md

## Claude Code specifics
- The VS Code extension may not auto-load nested `<package>/CLAUDE.md` —
  read it explicitly before working in a package (it imports that package's
  `AGENTS.md` and adds the Claude-only rules).
- Capture insights with the `engineering-insights` skill
  (`.claude/skills/engineering-insights/`): run it right away when you learn
  something non-obvious, and again as a wrap-up before reporting a task done
  (and before `/compact` or `/clear`). Do not skip this step.
