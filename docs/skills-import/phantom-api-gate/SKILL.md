---
name: phantom-api-gate
description: Flag imports and calls of functions, modules or endpoints that do not exist in the repo or its dependencies.
type: security
---

# Phantom API Gate

AI-written code often calls APIs that look plausible but do not exist. Flag every
reference in the diff that you cannot trace to a definition.

## CRITICAL
- An import of a module path or package that is not in the repo and not in
  `package.json` dependencies (a typo-squat or hallucinated package is a supply-chain risk).
- A call to an exported function, method or HTTP route that the diff uses but
  nothing in the diff, the repo skeleton or the callers section defines.

## WARNING
- A call with an argument shape that does not match the visible signature.
- A config key / env var read in code but never documented or defaulted.

## How to check
Use the "Repo skeleton" and "Callers of changed symbols" sections as the source of
truth for what exists. If a symbol is absent from both and not defined in the diff,
treat it as phantom. Cite the exact file:line of the import or call.
