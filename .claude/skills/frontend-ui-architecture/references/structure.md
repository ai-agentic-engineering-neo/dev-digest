# Structure — layers, placement, promotion

Source IDs (S..) resolve in `../README.md` → "Sources".

## Why this shape

No official React or Next.js doc prescribes a folder structure. Next.js calls itself
"unopinionated" and lists three equally valid strategies; the only demand is to pick one and be
consistent [S12]. The community consensus (Bulletproof React, Feature-Sliced Design, Wieruch,
Qiu/Fowler) is one model at three scales [S28, S34, S55, S60]:

| Scale | Generic name | DevDigest client |
|---|---|---|
| App composition | `app/` / FSD `app`+`pages` | `src/app/**` (routes, `page.tsx`, `layout.tsx`) |
| Product areas | `features/` / FSD `widgets`+`features` | `app/<route>/_components` (one route) and `components/` (2+ routes) |
| Shared, domain-free | `components/ui`, `lib`, `utils`, `config` / FSD `shared` | `vendor/ui`, `lib/`, `vendor/shared` |

The client already mixes Next's strategy 1 (shared code outside `app/`) and strategy 3 (split by
route with `_private` folders) [S12]. That is legitimate; this skill writes the rule down.

## Layers and allowed imports

| From ↓ may import → | `vendor/*` | `lib/*` | `components/*` | own route `_components` | other route `_components` | `app/**/page.tsx` |
|---|---|---|---|---|---|---|
| `vendor/ui`, `vendor/shared` | ✔ (within vendor) | ✘ | ✘ | ✘ | ✘ | ✘ |
| `lib/**` | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ |
| `components/**` | ✔ | ✔ | ✔ (other shared components) | ✘ | ✘ | ✘ |
| `app/<route>/_components/**` | ✔ | ✔ | ✔ | ✔ (own subtree, and parent route's) | ✘ | ✘ |
| `app/**/page.tsx`, `layout.tsx` | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ |

"Parent route's" means a nested route may reuse a component from an ancestor segment's
`_components` (e.g. `pulls/[number]` using `pulls/_components`). Siblings may not — if two
sibling routes need it, promote it.

Unidirectional imports and "no cross-feature imports, compose at app level" are the core of
Bulletproof React, enforced there with `import/no-restricted-paths` [S28, S81]; FSD states the
same as "a module imports only from layers strictly below" [S34, S35].

## The promotion rule

1. Start in the consumer's file.
2. Grows / needs a test → its own file in the consumer's folder (`helpers.ts`, `constants.ts`,
   `_components/<Child>/`).
3. A second component in the same route needs it → move to the route level
   (`app/<route>/helpers.ts`, `app/<route>/_components/<Name>`).
4. A second route needs it → `components/<kebab-name>/` (UI) or `lib/<topic>.ts` (logic).
5. It has no DevDigest domain knowledge and is a design-system primitive → it belongs in
   `vendor/ui` (changed only with a vendor sync, see client/CLAUDE.md).

When promoting, strip route-specific knowledge (route params, page copy, namespace lookups) and
pass it in as props. Demote code back when its second consumer disappears.
[S41 "place code as close to where it's relevant as possible"; S55 one-feature → stays,
2+ features → shared; S56 structure evolves single file → folders → features]

## Route folder anatomy

```
app/repos/[repoId]/pulls/[number]/
  page.tsx                     thin: params → <View/>  (logic in the view, not here)
  _components/
    FindingsPanel/
      FindingsPanel.tsx        the component
      SeverityCounters.tsx     small private sibling — same folder is fine
      FindingsPanel.test.tsx   colocated test
      helpers.ts               pure logic (filter/sort/group) + helpers.test.ts
      constants.ts             option lists, maps, limits
      styles.ts                export const s = { … } (CSSProperties)
      index.ts                 export { FindingsPanel } from "./FindingsPanel";
    RunTraceDrawer/
      _components/TraceBody/   children used only by RunTraceDrawer
  constants.ts · helpers.ts    route-level shared bits (used by 2+ components of this route)
```

The `_` prefix excludes the folder from routing [S12]. Only code used by this route goes there;
anything reusable across routes goes to `components/` or `lib/` (Wieruch's objection to private
folders is about reuse — the promotion rule answers it) [S55].

## `components/` today — and the `features/` question

`components/` holds app-level components used by 2+ routes: `app-shell`, `page-shell`,
`diff-viewer`, `mermaid-diagram`, `repo-not-found`, `run-cost-badge`, `showcase`. Some of these
are domain components (`diff-viewer`, `run-cost-badge`), which in Bulletproof/FSD terms would
be `features/` or `widgets/`, not shared UI [S28, S35]. Because generic primitives already live
in `vendor/ui`, `components/` effectively *is* the cross-route feature layer here, so no
`features/` folder is introduced now.

Introduce `src/features/<domain>/{components,hooks,helpers.ts,constants.ts}` only by decision,
when one domain (e.g. reviews) accumulates components + hooks + logic used by several routes and
`lib/hooks/<domain>.ts` + `components/` start feeling scattered. Record it as an ADR and migrate
one domain per PR.

## What not to do

- A global `src/constants.ts`, `src/utils.ts`, `src/helpers.ts` dump [S35 "dump" warning, S77, S78].
- `components/` filling up with single-use components "for tidiness".
- Folders by technical type at the top (`src/hooks`, `src/containers`, `src/styles`) for code
  that belongs to one route [S28].
- Nesting deeper than ~3–4 levels inside one component tree — split the component or promote [S11].
