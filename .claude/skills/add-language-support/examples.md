# Add Language Support — what actually went wrong, and why the fix generalizes

Every example here is from the real Go implementation
(`docs/go-language-support-plan.md`), not a hypothetical. Each one changed a
step in [SKILL.md](SKILL.md)'s workflow — that's the bar for adding a new
example here: it has to have actually changed the process, not just be a
Go-specific quirk.

## The pointer-type bug — verify field *position* against a real parse

**What looked reasonable:** Go's grammar wraps a pointer receiver type
(`*Foo`) in a `pointer_type` node. To "unwrap the pointer" and get the bare
type name, the first implementation did:

```ts
let type = getField(param, 'type');
if (type?.kind() === 'pointer_type') {
  type = type.children()[0] ?? null; // looked reasonable
}
```

**What actually happened:** `pointer_type`'s children are `['*',
'type_identifier']`, in that exact order. `children()[0]` is the `*` token,
not the type. No crash, no type error — `receiverTypeName()` just always
returned `null`, so the `Receiver.Method` dual-emit convention (mirrored
from the TS/JS class-method pattern) silently degraded to bare-name-only for
an entire implementation pass, caught only by writing a debug script that
parsed a real snippet and printed the actual tree.

**The fix:**

```ts
type = type.children().find((c) => c.kind() === 'type_identifier') ?? null;
```

**Why this generalizes:** never assume a child node's *position* — filter by
`kind()`. This is exactly why [SKILL.md](SKILL.md)'s "Before starting"
section requires a live parse-and-inspect script before writing any
extraction code, not just a read of `node-types.json` or the grammar's
published docs. A field list documents *what exists*, not *what order it
appears in* — that gap is where this bug lived.

## The missing phantom-globals entry — a dispatcher being language-aware doesn't mean its consumers are

**What looked complete:** Phase 1 gave `parseInvocationHeads` a full Go
implementation, wired into `astgrep/index.ts`'s per-language dispatcher
alongside the other 3 functions. All 6 phases of the plan shipped, every
phase's own tests passed, `pnpm typecheck` was clean.

**What actually happened:** `parseInvocationHeads`'s only real consumer,
`service.ts`'s `getUnresolvedReferences` (the phantom-API gate), filters
its output through a hardcoded `PHANTOM_GLOBALS_ALLOWLIST` — a flat list
of JS/TS builtins (`console`, `Math`, `Buffer`, `fetch`, ...) written long
before Go existed in this codebase. This allowlist lives one layer above
the astgrep dispatcher; Phase 1's per-language-module refactor touched the
dispatcher and the two `langs/*.ts` files, not this. Verified empirically:
parsing `s := make([]int, 0); s = append(s, 1); n := len(s)` returns
`make`, `append`, `len` as bare invocation heads — all `identifier`-kind
calls, syntactically indistinguishable from a real phantom call — and none
of them were in the TS-only allowlist. **Every ordinary Go file would have
had its builtins flagged as phantom APIs.** This was undiscovered for the
entire span of the Go implementation because `getUnresolvedReferences`
itself had zero positive-path test coverage, for either language — only
degraded-contract tests (flag-off, no-clone) existed.

**The fix:** split the allowlist per language
(`PHANTOM_GLOBALS_BY_LANGUAGE`, keyed by `languageIdForFile`), and added
Go's predeclared identifiers (builtin functions AND builtin types used in
conversion-call syntax like `string(b)` — both parse as bare calls in
Go's grammar).

**Why this generalizes:** the per-language-module design (this skill's own
headline principle) correctly isolates language-specific logic *inside*
the dispatch layer — but says nothing about code that sits *above* it and
reads its output with its own implicit single-language assumption. Before
declaring a language done, grep every consumer of `parseSymbols` /
`parseReferences` / `parseInvocationHeads` / `parseImports` (not just the
dispatcher itself) for a hardcoded list, keyword set, or allowlist that
predates this being a multi-language codebase. `pnpm typecheck` cannot
find this class of bug — it's logically wrong, not a type error — which is
exactly why [SKILL.md](SKILL.md)'s workflow now requires a positive-path
test through the real facade method, not just the astgrep layer.

## The 5th consumer — `pnpm typecheck` finds what grep misses

**What looked complete:** before adding `.go` to the shared registry, a
grep-based audit of `SUPPORTED_EXT`'s consumers found 3 documented call
sites (`walk.ts`, `service.ts`, `incremental.ts`) plus one already-known 4th
(`astgrep/index.ts`).

**What actually happened:** `depgraph/index.ts` was a genuine 5th consumer,
missed by the grep audit (it imported the constant under a slightly
different local alias pattern than the other four). It only surfaced as a
`tsc` TS2305 import error *after* the registry migration had already
shipped — `pnpm typecheck` caught it; the pre-migration grep did not.

**Why this generalizes:** a text search finds what matches the search
terms you thought to use; a type-checker finds every place the compiler
actually depends on the changed symbol, regardless of how it's imported or
aliased. [SKILL.md](SKILL.md)'s workflow step 6 makes `pnpm typecheck` — run
immediately after the registry change, and again after each subsequent
step — the actual completeness gate, not an audit grep run once at the
start.

## The NUL byte — not language-specific, but a reminder the tooling can lie

Not a language-support bug at all — a pre-existing, unrelated literal NUL
byte (`0x00`) was found embedded in `depgraph/index.ts`'s
`` `${from} ${to}` `` line, sitting where a space should be. It silently
broke exact-string-match `Edit` calls against that line even though `Read`
displayed what looked like an ordinary space. Diagnosed with
`sed -n '<n>p' file | od -c`; fixed by rewriting the file's raw bytes
(Python, `bytes.replace(b'\x00', b' ')`).

**Why it's here anyway:** if an `Edit` call inexplicably can't match text
that `Read` clearly shows — during language-support work or otherwise —
`od -c` on the suspect line is worth trying before assuming the tool is
broken or the file changed underneath you.

## What a *good* new-language PR looks like

- One `LanguageDef` entry, one `astgrep/langs/<id>.ts`, one
  `codeindex/extract-<id>.ts`, at most one `depgraph/<id>.ts` — no edits to
  `astgrep/shared.ts`'s language-agnostic helpers unless a genuinely new
  cross-language primitive is needed (rare; flag it if so).
  Zero edits to `reviews/helpers.ts`, `pipeline/full.ts`,
  `pipeline/incremental.ts`, or the seeded prompts — those are all
  registry-driven and pick up the new language automatically.
- A live-parse debug script's findings show up as verified field names in
  the plan doc, not as "per the docs" citations.
- `pnpm typecheck` run after the registry step and after the astgrep/depgraph
  steps, not just once at the end.
- An integration test with **at least 2 local files importing each other**
  — a single-file fixture never exercises the depgraph builder at all.
