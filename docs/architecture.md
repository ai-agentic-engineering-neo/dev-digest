# Architecture

Full diagram + module table → [../README.md#architecture](../README.md#architecture).

Short version: `client` (Next.js :3000) calls `server` (Fastify :3001, Drizzle/Postgres) over HTTP; `server` imports `reviewer-core` directly (pure lib, no HTTP boundary) via tsconfig path alias for the review pipeline (diff → prompt → LLM → findings); `e2e` drives `client` end-to-end over CDP (Vercel agent-browser, no LLM in the loop).
