# Deprecation policy

Flag a removal or replacement of a public contract element that skips the
deprecation path — no advance notice, no migration guidance, no grace
period — in favor of silently pulling it out.

## What to flag

- **Removed and replaced in the same diff**: a route, field, function, or
  config option is deleted in the very same change that introduces its
  replacement, with no prior release where it was marked deprecated first.
- **No deprecation signal before removal**: no `Deprecation`/`Sunset`
  response header, no `@deprecated` JSDoc tag on an exported function, no
  `deprecated: true` in an OpenAPI/schema annotation, no runtime warning —
  the item simply stops existing with no prior signal a consumer could have
  detected.
- **Insufficient notice period**: a deprecated item removed without a
  reasonable grace period elapsing (follow this repo's own stated
  deprecation policy if one exists; otherwise apply the general expectation
  of at least one release cycle of advance notice).
- **Deprecation notice with no migration path**: the item is marked
  deprecated, but the notice doesn't say what to use instead, or gives no
  concrete replacement example — a consumer sees the warning but has no
  actionable next step.
- **Contradicts its own deprecation**: an item is marked deprecated but is
  still being actively expanded or changed in this same diff — either
  commit to the removal path or stop deprecating it.
- **Fake deprecation via silent staleness**: a "deprecated" field is kept in
  the response but silently stops being populated/updated (returns stale or
  frozen data) instead of either continuing to work correctly or being
  clearly documented as unreliable.

## How to judge

- A removal is policy-compliant if there's evidence in this diff or the
  provided context that the item was previously marked deprecated, with a
  migration path, and a reasonable notice period elapsed before this
  removal.
- Purely internal code, or something deprecated and removed within the same
  unreleased branch before any consumer could ever have depended on it,
  doesn't need the full policy — judge blast radius the same way
  `breaking-change` does.
- A correctly-executed deprecation — marked, documented with a replacement,
  and still functioning in this diff — is not a finding at all.

## Severity guidance

- CRITICAL for an outright removal of a still-used public contract element
  with zero prior deprecation notice.
- WARNING when a deprecation notice exists but is incomplete — no
  replacement/migration path, or no removal-date (`Sunset`) signal.
- SUGGESTION when the deprecation is done correctly but could be
  strengthened, e.g. adding a machine-readable `Sunset` header alongside an
  existing docs note.
