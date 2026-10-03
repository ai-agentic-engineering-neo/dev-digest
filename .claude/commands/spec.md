---
description: Write a feature spec with the spec-creator agent, relaying its questions until nothing is open
argument-hint: <feature description, links or image paths>
---

Write a spec for: $ARGUMENTS

1. Launch `spec-creator` with the request and every design source verbatim.
2. Read its reply headings:
   - **Research requests** → run them as parallel `researcher` agents (one
     message), then resume `spec-creator` with `SendMessage` and the findings.
   - **Blocking questions** and **Proposals** → put them to the user with
     `AskUserQuestion` (questions first, recommended option first; each
     proposal as accept / reject / defer). Never answer on the user's behalf.
     Resume `spec-creator` with the answers.
3. Repeat until `Status: draft` with no blocking questions.
4. Tell the user the spec path and its Self-check, and remind them that a
   human sets `Status: approved` before `/plan-feature`.
