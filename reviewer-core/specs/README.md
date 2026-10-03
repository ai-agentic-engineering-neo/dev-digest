# reviewer-core/specs

One file per engine change: `YYYY-MM-DD-feature-name.md`, using the base
skeleton from [`../../specs/README.md`](../../specs/README.md).

Module-specific points every spec here must cover — as behaviour inside
*Cross-module interactions* / *Contracts*, not as file locations:

```markdown
## Module specifics (reviewer-core)
### Prompt slots       <!-- new/changed section in assemblePrompt -->
### Public API         <!-- what src/index.ts starts exporting; who consumes it -->
### Grounding impact   <!-- does this change what survives the gate? -->
### Determinism        <!-- must stay reproducible under a stubbed LLMProvider -->
```

Two constraints every spec here must respect: the package stays **pure** (no DB,
GitHub, or filesystem), and the **grounding gate keeps its veto**. A spec that
needs either broken belongs in `../../server/specs/` instead.
