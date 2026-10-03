# Layer map — current ring compliance per module

Live snapshot of `server/src/modules/*/`, checked against [SKILL.md](SKILL.md)
§1–§3. Consult this **before** touching any module — it tells you whether
you're starting from a compliant module (extend the existing split) or a
known-debt one (don't add a new violation on top of it; see
[enforced.md](enforced.md)).

| Module | routes.ts | service.ts | repository.ts | `container.db` in routes.ts | Status |
|---|---|---|---|---|---|
| `agents` | ✓ | ✓ | ✓ | no | Compliant |
| `polling` | ✓ | ✓ | ✓ | no | Compliant (`service.ts` composes `pulls/service.ts` for the shared GitHub-PR sync — see its own repository.ts for the `last_polled_at` bump) |
| `pulls` | ✓ | ✓ | ✓ | no | Compliant |
| `repo-intel` | ✓ | ✓ | ✓ | no | Compliant |
| `repos` | ✓ | ✓ | ✓ | no | Compliant |
| `reviews` | ✓ | ✓ | ✓ (split: `repository/{pull,review,run}.repo.ts`, §3) | no | Compliant |
| `settings` | ✓ | ✓ | ✓ | no | Compliant |
| `workspace` | ✓ | — | ✓ | no | Compliant (routes-only genuinely fine: single pass-through read, calls `WorkspaceRepository` directly per SKILL.md §1) |

`_shared/` is not a module — it's cross-module request-context/schema
helpers (`context.ts`, `schemas.ts`) that every `routes.ts` imports, not a
`routes.ts → service.ts → repository.ts` unit itself. Excluded from the
table above.

## How this table is derived

```sh
# ring files present per module
ls server/src/modules/<name>/

# direct container.db access in the HTTP layer (the §2 threshold check)
grep -rln "container.db" server/src/modules/*/routes.ts
```

A module is **Compliant** when it has zero `container.db` hits in
`routes.ts` — either because it has a `repository.ts` (persistence exists,
routed through the correct ring) or because it performs no persistence at
all (the "routes-only genuinely is fine" case in SKILL.md).

## Keeping this current

This file goes stale the moment a module gains/loses a ring file or a
`container.db` call moves. Regenerate the two commands above and update the
affected row whenever you finish editing a module — [enforced.md](enforced.md)'s
checklist requires this as its last step.
