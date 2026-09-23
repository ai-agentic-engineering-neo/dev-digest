# Shared severity scale

Each review skill has its own wording. The dispatcher maps everything onto one
scale, so a verdict means the same thing whichever skill produced the finding
(plan §8).

## CRITICAL — blocks the merge

- A deterministic gate failed: typecheck, lint, `arch:check` (new violation),
  shared-contract drift, schema changed without a migration, secret in an added line.
- A rule the skill itself calls CRITICAL (e.g. `react-best-practices` hook misuse
  that breaks rendering, a `zod` parse that can throw at a trust boundary).
- `security` findings rated CRITICAL, or HIGH when the skill states high confidence
  (injection, SSRF, auth bypass, secret handling, path traversal).
- Onion dependency direction broken: an inner ring importing an outer one
  (`domain` → Drizzle/adapters/framework, `application` → `db/`).
- The diff contradicts an acceptance criterion of the feature spec.

## HIGH — warning, does not block

- An acceptance criterion is not covered by the diff (missing, not contradicted).
- `insight-violation`: the change repeats a mistake recorded in a package's
  `INSIGHTS.md`. CRITICAL only when that insight describes a breakage, not a style.
- A source file changed with no test touched next to it.
- A CRITICAL that failed verification (marked `unverified`).

## MEDIUM / LOW — report only

- Naming, structure, duplication, readability, small performance wins.
- Anything the skill marks as a suggestion.

## Rules of thumb

- Only the changed lines count. A pre-existing problem on an untouched line is
  reported at most as LOW context, never as a blocker.
- No severity inflation: if the fix is "consider", it is not CRITICAL.
- Every finding carries `file:line`, the evidence from the diff, and a concrete fix.
