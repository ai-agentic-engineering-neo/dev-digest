# DevDigest Context Management Strategy (L01)

To ensure efficient context management within Claude Code, we are implementing a **"Lazy Loading"** strategy with a clear separation of responsibilities across `CLAUDE.md` files.

## Implementation Principles

1. **References Only**  
   Currently, we avoid `@import`. We use pointer-references that the agent reads manually only as needed.

2. **Main `CLAUDE.md`**  
   Contains high-level "top-touch" points and a `"read when..."` section for key documents, including:
   * Pipeline architecture (`README.md` architecture diagram, `reviewer-core/README.md#pipeline`)
   * Route contracts (`server/README.md`)
   * Module lessons (`<module>/INSIGHTS.md`)

3. **Per-Module Conventions**  
   **DO NOT** duplicate rules in the root directory. Place them in `<module>/CLAUDE.md` (`server`, `client`, `reviewer-core`, `e2e`) for automatic lazy loading based on location (similar to per-module `INSIGHTS.md`).

4. **Repo-Intel Architecture**  
   We link to information but never duplicate the text. The `README` and `docs/` folders must remain the single source of truth.

5. **Pointer Format**  
   Instructions are formulated as clear `"read when..."` directives rather than suggestions. This ensures the model does not ignore references due to its probabilistic nature.

6. **Bridge to L06 (Future Roadmap)**  
   When we require absolute determinism (moving beyond "I hope it reads this"), we will transition to using slash-commands or hooks. This represents our parallel development arc.
