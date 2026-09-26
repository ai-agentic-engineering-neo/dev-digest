# Coupled files

Pairs of code that must change together and that no compiler, test or
`arch:check` links. `scripts/precheck.sh` parses the list below: when the diff
touches one side's symbol but not the other's, it reports a **MAJOR**
`coupled-files` finding. A reviewer then decides whether the twin really needed
the same change.

Line format, parsed literally (keep it exactly like this):

```
  - `<path A>` `<symbol A>` <-> `<path B>` `<symbol B>` — why they are coupled
```

(Shown indented so the parser skips this example; real entries start at column 0.)

`<symbol>` is matched as plain text against the changed lines and hunk headers
of that file; `*` means "any change to the file".

Add a pair when a bug came from changing one side only, and cite the source.
Remove a pair when the duplication is gone.

## Pairs

- `server/src/modules/pulls/status.ts` `pickLatestReviewIds` <-> `client/src/components/findings-preview/helpers.ts` `latestReviewPerAgent` — both define "which reviews the PR-list FINDINGS column counts"; one side alone makes the chips and the hover card disagree (root INSIGHTS.md, 2026-09-20)
- `server/src/modules/reviews/repository.ts` `completeAgentRun` <-> `server/src/modules/reviews/repository/run.repo.ts` `completeAgentRun` — the value type is declared on the facade and on the repo; extending one gives TS2353 at the call site (server/INSIGHTS.md, 2026-09-19)

## Handled by the script, not listed here

- `server/src/vendor/shared/**` vs `client/src/vendor/shared/**`: every touched
  contract file is compared with its twin path (`contract-copy`, MAJOR). The copies
  have drifted on purpose, so only the touched file is compared, never the whole
  directory (root INSIGHTS.md, 2026-09-19).
