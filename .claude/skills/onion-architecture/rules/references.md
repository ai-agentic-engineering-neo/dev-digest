# References

Six authoritative sources behind this skill. All URLs were fetched and verified (HTTP 200) during research.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 1 | Jeffrey Palermo — "The Onion Architecture: Part 1" (2008, the original) | https://jeffreypalermo.com/blog/the-onion-architecture-part-1/ | Canonical definition; Palermo coined the term. Microsoft Learn links to this exact URL. |
| 2 | Microsoft Learn — "Common web application architectures" | https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures | Authoritative framing of Onion/Clean as the same family. Dependency inversion, project layout rules, and Figures 5-10 / 5-11 for the unit-vs-integration test split. |
| 3 | Herberto Graca — "Onion Architecture" (The Software Architecture Chronicles) | https://herbertograca.com/2017/09/21/onion-architecture/ | Clear layer breakdown and comparison with Hexagonal and Clean Architectures. Widely cited. |
| 4 | Milan Jovanovic — "Clean vs Onion vs Hexagonal Architecture" | https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal | Identifies four common pitfalls: false-choice, over-engineering, nomenclature obsession, misaligned priorities. Direct source for several anti-patterns in this skill. |
| 5 | Methods & Tools — "Chop Onions Instead of Layers in Software Architecture" | https://www.methodsandtools.com/archive/onionsoftwarearchitecture.php | Explains the dependency inversion vs N-layer contrast. Source for the CRUD escape hatch in [pragmatism.md](pragmatism.md). |
| 6 | Uncle Bob — "The Clean Architecture" | https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html | The Dependency Rule stated verbatim; the companion/evolution of Palermo's Onion. |

## Excluded source

The Medium article `sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-...` returned HTTP 403 when fetched during research and is intentionally excluded despite appearing in search results.
