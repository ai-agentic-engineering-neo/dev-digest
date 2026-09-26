# Fix: `ERR_PNPM_IGNORED_BUILDS`

**Error:**
```
Error: ERR_PNPM_IGNORED_BUILDS
Ignored build scripts: esbuild, cpu-features, protobufjs, ssh2, sharp, ...
```

**Cause:** pnpm blocks native `postinstall`/`install` scripts by default. Both
`server/pnpm-workspace.yaml` and `client/pnpm-workspace.yaml` already had an
`allowBuilds` block, but the values were unfilled placeholders
(`esbuild: set this to true or false`) instead of `true`/`false`.

**Fix:** run `pnpm approve-builds` from *inside* the package that owns the
lockfile (not the repo root) so pnpm can find the pending approvals:

```bash
cd server && pnpm approve-builds --all -y
cd ../client && pnpm approve-builds --all -y
```

This fills in `allowBuilds` with `true` for each dependency and runs their
build scripts. Then `pnpm install` completes with no errors.

Note: `ssh2`'s optional native crypto binding may fail to compile on newer
Node versions (V8 API change) — it's optional and ssh2 falls back to
pure-JS crypto, so it doesn't block the install.
