# Response schema drift

Flag changes to a response *body's shape* — field types, required/optional
status, nesting, nullability, or envelope structure — that would change how
an existing, unmodified consumer needs to parse or interpret the response.
This skill covers the response body's internal shape; whether the route or
symbol itself still exists belongs to the `breaking-change` skill instead.

## What to flag

- **Field removed** from a response object that a consumer might
  destructure or read.
- **Field type narrowed**, or a previously-always-present field becomes
  optional or nullable — a consumer that assumed non-null (e.g. calls
  `.toUpperCase()` on it unconditionally) now crashes. Note the *reverse*
  (optional/nullable → always-present) is safe and does not need flagging.
- **Silent semantic type change** without a rename: e.g. a timestamp field
  switches from unix-seconds to an ISO-8601 string, or a `Date` becomes a
  formatted string — the field name is unchanged but every consumer's
  parsing breaks.
- **Envelope shape changed**: a bare array response becomes `{ data: [...]
  }` (or vice versa), or a paginated response's cursor/offset shape changes.
- **Zod contract narrowed** in `vendor/shared/contracts/*`: removing
  `.optional()`/`.nullish()`, adding a `.min()`/`.max()`/regex constraint to
  an existing field, or removing a value from a response enum.
- **Hand-mirrored contract drift**: this repo hand-mirrors
  `vendor/shared/contracts/*` between `server/` and `client/` — only one
  copy updated to match the new response shape means the wire contract
  itself disagrees with what the client expects, even though both sides
  compile.
- **Error response envelope restructured**: consumers that pattern-match on
  the error body's shape (not just the status code) break silently.

## How to judge

- A field removal, a type narrowing, or an always-present field becoming
  optional/nullable is breaking for any consumer that isn't defensively
  coded for it.
- A new response enum member is additive "on paper," but flag it as a real
  risk if the diff or nearby repo context shows a consumer doing an
  exhaustive `switch`/`if`-chain over that enum with no `default`/fallback
  case — the new member falls through unhandled.
- Always check both hand-mirrored contract copies (server + client) actually
  match after the change, not just that each one individually compiles.
- A purely additive optional field with no evidence of a strict/closed
  consumer is safe.

## Severity guidance

- CRITICAL when a field is removed, or a type is narrowed/flipped to
  nullable, on a response with existing unmodified consumers.
- WARNING when a new enum member lands near an exhaustive switch with no
  default case, or when only one of the two hand-mirrored contract copies
  was updated.
- SUGGESTION for a purely additive optional field with no known
  strict-shape consumer.
