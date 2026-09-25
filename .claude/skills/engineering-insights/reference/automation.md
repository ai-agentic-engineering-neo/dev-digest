# Making the wrap-up unconditional

A manual trigger is skipped often enough that the file stops learning. Two
optional layers, both reminder-only. Extraction and judgment stay in the skill.

## 1. Stop hook in `.claude/settings.json` (project-wide, every session)

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/skills/engineering-insights/scripts/stop-nudge.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

`stop-nudge.sh` reads the Stop payload, exits silently when `stop_hook_active`
is true (so it cannot loop), and otherwise returns
`hookSpecificOutput.additionalContext` with the wrap-up reminder. It does not
block the stop and does not write any file.

## 2. Skill-scoped hook (only while the skill is active this session)

Add to the SKILL.md frontmatter instead of settings.json when the nudge should
exist only after `/engineering-insights` was invoked once in a session:

```yaml
hooks:
  Stop:
    - hooks:
        - type: command
          command: "${CLAUDE_SKILL_DIR}/scripts/stop-nudge.sh"
```

## Optional: track touched packages with PostToolUse

A `PostToolUse` hook with `"matcher": "Edit|Write"` receives
`tool_input.file_path`; piping it through `insight.sh module` and appending the
result to a scratch file gives the wrap-up an exact list of packages to sweep.
Not needed while the agent can answer "which paths did I edit" from context.
