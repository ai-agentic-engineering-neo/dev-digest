# specs — cross-module

Feature specs whose behaviour spans two or more packages. A spec that touches only one package
lives in that package's own `specs/`, so the file sits where the work does.

Same rules as everywhere: `YYYY-MM-DD-<kebab-name>.md`, written before the code, stating what
"done" means and how to check it — never file paths, function names or code.

Sections: Problem & why · Goals / Non-goals · User stories · Acceptance criteria (EARS) ·
Edge cases · Non-functional · Cross-module interactions · Contracts · Untrusted inputs ·
Open questions. Each criterion is `AC-N`, phrased in EARS (`WHEN…SHALL`, `IF…THEN…SHALL`,
`WHILE…SHALL`, `WHERE…SHALL`, or a plain `shall`), and carries the observation that proves it.
A criterion nobody can check is a bug in the spec.
