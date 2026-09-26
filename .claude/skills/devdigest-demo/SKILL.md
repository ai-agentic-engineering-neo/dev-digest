---
name: devdigest-demo
description: DevDigest-specific conventions for recording demo videos — where the scenario, cue and config files live, which URLs to film, how to start the app and which controls must never be clicked. Read this before using the screencast-demo-maker plugin's demo-scenario or demo-film skills in this repository.
---

# DevDigest demo videos

Project conventions only. The engine is the `screencast-demo-maker` Claude Code plugin
(https://github.com/artemmmon/screencast-demo-maker): skills `demo-setup`, `demo-scenario`
(writes the shooting script), `demo-film` (records it) and the `frame-checker` subagent.

## Prerequisite

If `/screencast-demo-maker:demo-film` is not an available skill, the plugin is not
installed. Stop and give the user the two install commands from the plugin README; do not
improvise filming without it.

## Order

1. If `demo/<video>/` already holds `scenario.md` and `cues.json`, read them. Otherwise write
   them with `screencast-demo-maker:demo-scenario`, and let the user review them.
2. Ask the user to run `/screencast-demo-maker:demo-film` — it is user-invoked, an agent
   cannot start it. Never record before the user says "go".
3. Hand contact sheets to the `screencast-demo-maker:frame-checker` subagent; never read
   them in the main conversation.
4. Report what the frames and probes showed. The user judges the voice and the result.

## Layout

One folder per video under `demo/`. The first one is `demo/conventions/`.

| What | Where |
|---|---|
| One video's inputs | `demo/<video>/{scenario.md,cues.json,scenes.mjs,config.json}` |
| Source of truth the video must cover (`conventions`) | HW #2 grading criteria 19 and 38–53 (pasted by the author), `server/specs/conventions.md` (C1–C8) and the Conventions page, `client/src/app/(shell)/repos/[repoId]/conventions/page.tsx` |
| Finished video | `demo/<video>/<slug>.mp4` (e.g. `demo/conventions/devdigest-conventions.mp4`) |

Working files (clips, narration, frames, staged app profiles) never enter the repo; they
live in `~/.cache/demo-video/<slug>/`.

## Filming this app

- Start it with `./scripts/dev.sh` (Postgres → migrate → seed → API + web); it serves the
  studio at http://localhost:3000 and the API at http://localhost:3001. `config.healthUrls`
  checks both during preflight. The Conventions page is `/repos/<repoId>/conventions`.
- On screen: the browser only.
- Narration: Ukrainian, for the course mentor reviewing the homework. Filenames, code and
  this skill stay English.
- Display: this Mac has two 2560×1440 externals, and the MAIN one (where Claude Code runs)
  sorts first, so `video.display: "2560x1440"` alone would pick it. Run preflight with
  `--display-id=<id>` for the secondary external — `swift .../demo-film/scripts/displays.swift`
  lists the ids (today: `#2` @2560,0). Ids change on re-plug; re-check each session.
- Mutating controls in the video's own flow (Accept / Reject / Edit, Create skill, an
  agent's skill toggle, Run Review) may be clicked only if a pre-roll restores the data
  first, through the API: PATCH the candidates back, DELETE the demo-created skill and the
  demo's review runs. Extract / Re-scan are never run on camera: they take up to ~90 s and
  return different candidates each time. See `demo/conventions/scenario.md` § Pre-roll.
- `scenario.md` for `conventions` is written in Ukrainian at the author's request, an
  explicit exception to the root `CLAUDE.md` Language rule; `cues.json` and code stay as is.

## Never click

- `Delete agent`
- `Delete this review run`
- `Delete skill` (the pre-roll removes a demo-created skill through `DELETE /skills/:id`)
- `Remove`

They cost money or destroy data, and a demo must be reproducible. Hover to show that a
control exists — that is enough to prove it is there.

## Numbers that have bitten us

Add a line here every time the reality check in `demo-scenario` catches a number that the
screen renders differently from what is stored (rounding, per-page vs total, cached values).
