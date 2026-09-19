# specs — reviewer-core

One feature = one `NN-kebab-name.md`, written **before** implementation and updated when scope
changes. A spec states what "done" means, not what already exists.

This package changes rarely — most features land in `server/` or `client/` and only pass data into
slots that already exist. A spec belongs here when the engine's own behaviour changes: prompt
assembly, grounding, scoring, structured output.

Suggested sections: Intent · In scope / Out of scope · Acceptance criteria · Touches · Verification.
