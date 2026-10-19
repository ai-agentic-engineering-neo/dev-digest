# Insights — e2e
<!-- Append-only, written via the engineering-insights skill
     (.claude/skills/engineering-insights/SKILL.md). Newest on top of each section.
     Entry: - YYYY-MM-DD · <ALWAYS/NEVER/do X> — <why> (<path:line | command>) -->

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes
- 2026-10-18 · agent-browser 0.39 downloads Chrome for Testing 155, which cannot launch on macOS 12 (`Symbol not found: _kVTCompressionPropertyKey_ReferenceBufferCount`) — every flow fails at `open`; that's the host, not the app — run flows on macOS ≥13/CI, or verify via a regular Chrome (`agent-browser open http://example.com` reproduces)

## Recurring Errors & Fixes

## Session Notes

## Open Questions
