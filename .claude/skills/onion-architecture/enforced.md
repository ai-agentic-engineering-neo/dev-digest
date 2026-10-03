# Onion Architecture — enforcement checklist

This file is not background reading — it's a gate. Run through it, in
order, **before** writing or editing anything under
`server/src/modules/<name>/`, and again right before you consider the task
done. SKILL.md explains *why* each rule exists; this file exists only to
make sure the rule actually gets applied on this edit.

## Before writing any code

1. **Identify the module and look it up in [layer-map.md](layer-map.md).**
   Know whether you're starting from a Compliant module (match its existing
   split) or a known-debt one (`pulls`, `settings`, `polling`, `workspace`)
   before writing a line.

2. **About to add or edit `routes.ts`?** Ask: will this handler call
   `container.db` for anything beyond zero times?
   - **Yes, and the module has no `repository.ts`** → stop. Do not write the
     query inline. Create `repository.ts` first (SKILL.md §2).
   - **Yes, and `repository.ts` already exists** → add the query method
     there, call it from the handler. Never inline a new Drizzle call in
     `routes.ts`, even a one-off.
   - **No persistence at all** → routes-only is fine, no gate to pass.

3. **Does the handler logic amount to more than a single pass-through
   query** (a sync loop, an upsert-then-read, conditional branching over
   business rules)? → stop. That belongs in `service.ts`, not the handler
   (SKILL.md §2). Create `service.ts` if the module doesn't have one yet.

4. **About to add/edit `repository.ts` and the module now spans more than
   one distinct aggregate/table-group?** → split into
   `repository/<aggregate>.repo.ts` files composed by a thin
   `repository.ts` facade, following `reviews/`'s precedent (SKILL.md §3).
   Don't let one file's persistence queries for unrelated aggregates pile
   up because splitting felt premature.

5. **Service needs an external integration** (GitHub, LLM, git, astgrep)?
   → go through `container.<adapter>()`, never `import` the concrete
   adapter class into `service.ts` directly (SKILL.md §1).

6. **Working in a known-debt module** (`pulls`, `settings`, `polling`,
   `workspace`) but the task isn't "fix this module's layering"? → do not
   add a *new* `container.db` call to the existing violation. If you must
   touch persistence there, that's the signal to do the extraction now
   (repository.ts, and service.ts if business logic is involved) rather
   than deepen the debt — ask the user if that's in scope before expanding
   it silently.

## Before calling the task done

7. **Re-run the grep from [layer-map.md](layer-map.md):**
   ```sh
   grep -rln "container.db" server/src/modules/*/routes.ts
   ```
   Confirm the module you touched isn't newly listed — unless it was
   already known debt *and* fixing it was out of scope for this task.

8. **Update [layer-map.md](layer-map.md)'s row** for any module whose ring
   composition changed (a `repository.ts`/`service.ts` was added, a
   `container.db` call moved out of `routes.ts`, a `repository.ts` was
   split into `repository/`).

If any check in steps 1–6 tells you to stop, stop — don't write the
non-compliant version "for now" and note it as follow-up. The threshold in
SKILL.md §2 is the point past which the extraction is required, not
optional.
