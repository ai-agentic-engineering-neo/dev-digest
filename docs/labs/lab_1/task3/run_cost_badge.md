# Task 3: Run Cost Badge

## 1. Feature Implementation

### Overview
**Goal:** Display the cost and token usage for each run in two specific locations.

### Where it is displayed
* **COST column** in the PR list (compact format: `$0.012`).
* **Verdict banner row** on the PR Detail page (e.g., `$0.014 – 8.2K → 1.3K`).

### Data Source
* `usage (prompt_tokens, completion_tokens)` is already provided in the OpenRouter response and logs.
* **Calculation:** `cost = tokens × price`.

### Components
* **Server:** Handles input/output/cost at the individual run level and via GET routes.
* **Client:** Implementation of the `RunCostBadge` component (2 variants).

### Requirements (To-Do)
* Every completed run must display a badge.
* If a run has no data, display `--` (do **not** display `$0.00`).
* Ensure zero additional model calls are required to fetch this data.

---

## 2. Verification (Testing)

### Accuracy Check
* The cost figure must match both the run log and the OpenRouter dashboard (reports for the same run must be consistent).

### Formatting
* Use a readable format: $\ge$ 3 significant digits (e.g., `$0.012` instead of `$0.01`).

### Stale / Incomplete Runs
* Do not display "fake" or placeholder prices for incomplete runs.

---

## 3. Additional Notes
* This is the first personal metric of the course.
* We will revisit today's figures in Lesson 08 (L08).
