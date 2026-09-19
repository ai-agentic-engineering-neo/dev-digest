# CLAUDE.md Philosophy

> **CLAUDE.md is a map, not documentation.**

The most common mistake is writing `CLAUDE.md` as documentation. This file is intended for **context injection**, not as a manual. It is loaded into **EVERY** session.

## ✅ TO INCLUDE
* **Stack with versions:** The core technologies and their specific versions.
* **Build/Test commands:** Essential commands to run the project.
* **Top-level Map:** A high-level guide of "where everything is located."
* **Non-default conventions:** Specific rules that deviate from standard practices.
* **Gotchas:** Known pitfalls or edge cases.
* **"Do-not-touch" zones:** Critical areas of the codebase that should be left alone.

## ❌ DO NOT INCLUDE
* **Detailed architecture:** Avoid deep architectural dives.
* **File-by-file description:** Do not describe every single file in the repo.
* **Standard language rules:** Skip basic syntax or language conventions.
* **What a linter catches:** If a linter can detect it, don't write it here.
* **Volatile/changing data:** Avoid information that updates too frequently.

> *Claude will read the code itself; it is better to simply link to the relevant documentation.*

---

**Note on Efficiency (The $100 Re-call Problem):**
The issue with frequent re-calls isn't primarily about cost (since `CLAUDE.md` is cached and has a single price per session), but about **efficiency**. The goal is to manage "context rot" by intelligently tiling rules into the context freshness.
