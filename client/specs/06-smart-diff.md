# 06 — Smart Diff (client)

Server half + API: [`server/specs/06-smart-diff.md`](../../server/specs/06-smart-diff.md).
Design reference: prototype screenshots (grouped diff, group counters, inline
finding card, Smart/Original order toggle).
Status: **in progress** (2026-09-24).

## Goal

Files changed groups files by role (core, tests, wiring, docs, boilerplate;
the last two collapsed by default). The findings of each agent's newest review
show as per-severity group counters, a file-card dot, and an inline finding card under the code
line it belongs to. A Smart/Original order toggle switches back to GitHub's
file order.

## Out of scope

- Criteria 7, 15 (PR description + demo video — done by a human).
- Agent runs tab (unchanged), real `split_suggestion` / large-PR banner.

## Acceptance criteria

1. Files changed shows the 5 role groups in order core → tests → wiring →
   docs → boilerplate, each with a role label and a file count; the server
   always returns all 5, the client hides an empty group. **[B1]**
2. `docs` and `boilerplate` start collapsed; other groups follow the existing
   `AUTO_EXPAND_MAX_LINES` rule. A lockfile is in `boilerplate`. Inside a
   group, only file cards with a GitHub comment or a current finding start
   expanded; the rest start collapsed (until the user toggles a card, the
   default follows comments/findings as they load). Original order keeps the
   `AUTO_EXPAND_MAX_LINES` rule per file. **[B2]** (changed 2026-09-25)
3. After a review has findings, a group's header shows how many findings its
   files have per severity (`● N` in the severity colour, one per severity
   present); inside a group, files with the most severe finding come first
   (critical → warning → suggestion → none). **[B3]** (changed 2026-09-25:
   was a count of flagged files)
4. A file with findings shows a dot indicator next to its path in the file
   card header (distinct from the existing GitHub-comment counter). **[B4]**
5. Expanding such a file shows an inline card under the finding's line:
   severity, title, rationale, Accept/Dismiss — the same `FindingCard` used on
   Agent runs. **[B5]**
6. An "Original order" toggle restores GitHub's file order (one flat
   `DiffViewer`, no groups); the choice is kept in `?order=` in the URL.
   **[B6]**
7. The finding's code line carries a left color stripe and a right-aligned
   severity label (`blocker` / `warning` / `suggestion`). **[B11]**
8. Accept / Dismiss on an inline finding card call the same mutation as Agent
   runs and update the finding's state. **[B12]**
9. A finding whose line isn't in the current patch is rendered in an
   "Unmatched findings" block at the end of the file, never dropped. **[B13]**
10. One comments toggle hides GitHub review comments, finding cards and the
    unmatched block together; it sits next to the order toggle and defaults to
    on only when there are current findings. Clicking a line's severity badge
    hides/shows just that line's cards. **[B14]**
11. A group's sticky header stays visible while its body scrolls (the page
    scrolls inside `<main overflow:auto>`). **[B16]**
12. An inline finding card can be collapsed to one line. **[B17]**
13. Before any review has run, the tab shows a "no review yet" notice instead
    of zero counters/dots. **[B18]**
14. After Run review finishes, group counters and file dots update via the
    existing SSE-driven refetch, without a page reload. **[B19]**
15. Every group/role label and hint string comes from
    `messages/en/prReview.json` under `smartDiff.*` (`coreLabel` stays
    "Core"), including the new `testsLabel`/`docsLabel`. **[B20]**
