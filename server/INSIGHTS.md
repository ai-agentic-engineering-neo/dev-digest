# INSIGHTS.md

## Open Questions

- **2026-09-29** — `client/CLAUDE.md` documents its `pnpm-workspace.yaml` as
  just a `pnpm.allowBuilds` allowlist (not a real workspace); `server/`'s
  `pnpm-workspace.yaml` has the same pattern (`allowBuilds` for
  `cpu-features`, `esbuild`, `protobufjs`, `ssh2`) but `server/CLAUDE.md`'s
  Gotchas section has no equivalent note → should `server/CLAUDE.md` gain the
  same clarifying line, so the file isn't mistaken for stray monorepo config?
  Evidence: `server/pnpm-workspace.yaml`, `client/CLAUDE.md` Gotchas section.
