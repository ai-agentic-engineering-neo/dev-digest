---
name: semver-discipline
description: Decides whether the contract changes in the diff require a major, minor or patch version bump, and flags a major-class change that ships without a major bump.
type: custom
---

# Semver discipline

Every contract change has a version cost. Classify each change the diff makes
to a public surface:

- **MAJOR** — anything an existing caller cannot survive: a removal, a rename,
  a parameter made required, a narrowed type or enum, a changed status code.
- **MINOR** — additive: a new optional field, a new route, a widened enum, a
  new nullable column.
- **PATCH** — a behaviour fix under the same contract.

Then read what the diff *declares*: `package.json` `version`, an OpenAPI
`info.version`, a route prefix such as `/v1/`, a `CHANGELOG.md` entry.

Report **WARNING** — "major-class change without a major bump" — when the diff
contains at least one MAJOR-class change and the declared version moved by
less than a major, or did not move at all. List the change that forces the
major and the version the diff should declare. A new route prefix (`/v2/…`)
with the old route left in place counts as a major bump for that route.

If the diff changes no public surface, say nothing about versioning.

## Good

```diff
-  "version": "1.4.2",
+  "version": "2.0.0",
```

```diff
 app.get('/repos/:id/pulls', …)      // unchanged, still served
+app.get('/v2/repos/:id/pulls', …)   // the new shape lives here
```

A breaking shape, a major bump, and the old route still served: consumers
choose when to move.

## Bad

```diff
-  "version": "1.4.2",
+  "version": "1.4.3",
```

```diff
-  status: z.enum(['open', 'merged', 'closed']).optional(),
+  status: z.enum(['open', 'merged', 'closed']),
```

A parameter made required is major-class; the diff ships it as a patch.
WARNING: cite both lines and state that the declared version must be `2.0.0`,
or the parameter must stay optional.
