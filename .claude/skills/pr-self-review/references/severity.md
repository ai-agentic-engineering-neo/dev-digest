# Severity rubric

- **critical** (blocks PR): security vulnerability (OWASP, per `security` skill); secret in code; new dependency-rule violation; data loss / destructive migration; broken client↔server API contract; any `guard` finding.
- **major** (does not block, listed first): violation of a skill's conventions — placement, `'use client'` boundary, fat `routes.ts`, hook misuse, missing validation on non-trust-boundary code.
- **minor**: style, suggestions.

When in doubt, downgrade. `critical` requires a concrete `file:line` and a `scenario` (inputs/state → what goes wrong). Speculative "could be" issues are major at most.
