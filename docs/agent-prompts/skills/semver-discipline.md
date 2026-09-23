# Semver discipline

Flag a mismatch between a change's actual severity — breaking, feature, or
fix — and the version signal (or lack of one) that ships with it. This
skill does not itself decide *whether* a change is breaking; it assumes
that classification (from `breaking-change` / `response-schema`) and checks
whether the version story matches it.

## What to flag

- **Breaking change, no major bump**: a diff that removes/renames/narrows a
  public export, route, or contract field without bumping the *changed
  package's own* `package.json` major version. This repo is explicitly NOT
  a workspace — each package (`server/`, `client/`, `reviewer-core/`) has
  its own `package.json`/lockfile — so check the version file in the
  package that actually changed, not a sibling.
- **Wrong package's version bumped**: the major version moved, but in a
  different package's `package.json` than the one containing the breaking
  change.
- **Over-declared bump**: a MAJOR version bump for a change that is actually
  backward-compatible — forces unnecessary migration work/noise on
  consumers who trusted the signal.
- **Pre-1.0 exemption claimed too late**: treating a `0.x.y` package as
  "anything goes, semver doesn't apply yet" when it already has real,
  external consumers depending on its shape.
- **Bundled, undifferentiated breaks**: several unrelated breaking changes
  landed under one version bump with no per-change changelog/release-note
  entry, leaving consumers unable to tell which part of the bump affects
  them.
- **No versioning story for a breaking app-level change**: a breaking change
  to an internal Fastify route or API with no package version to bump at
  all, and also no explicit API version (URL/header) or migration note —
  the absence of any signal is itself the problem.

## How to judge

- First classify whether the diff is breaking (reuse `breaking-change` /
  `response-schema` judgment) — a non-breaking change needs no major bump,
  full stop.
- If the changed file belongs to a versioned package, the major segment of
  *that* package's own `package.json` must move for a breaking change.
- If there is no package version in play (an internal app route with no
  published consumer contract beyond "the client that ships with it"), the
  finding is the absence of any versioning/migration strategy for the
  break — not a specific expected version number.
- Don't flag a version bump that correctly matches the change's severity,
  even if the changelog entry is terse — that's a SUGGESTION at most.

## Severity guidance

- CRITICAL when the diff is clearly breaking and there is zero version
  signal anywhere (no major bump, no API version, no changelog note) for a
  package or route with real consumers.
- WARNING when a version was bumped but at the wrong severity for the
  change, or in the wrong package's `package.json`.
- SUGGESTION when the version is handled correctly but the changelog/release
  note doesn't explain the specific break well enough for a consumer to
  self-assess impact.
