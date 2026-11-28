# SDK adapters, jobs, SSE, config

## External SDKs → `src/adapters/**`
| SDK | Port (`@devdigest/shared/adapters.ts`) | Adapter |
|---|---|---|
| `octokit` | `GitHubClient` | `adapters/github/octokit.ts` |
| `simple-git` | `GitClient` | `adapters/git/simple-git.ts` |
| `openai`, `@anthropic-ai/sdk`, OpenRouter | `LLMProvider` | `adapters/llm/*`, `reviewer-core/src/llm/openrouter.ts` |
| `openai` embeddings | `Embedder` | `adapters/embedder/openai.ts` |
| `@vscode/ripgrep` | `CodeIndex` | `adapters/codeindex/ripgrep.ts` |
| `@ast-grep/napi`, `dependency-cruiser`, `js-tiktoken` | `DepGraph`, `Tokenizer`, … | `adapters/astgrep`, `depgraph`, `tokenizer` |

Rules:
- An SDK is imported only in its adapter (`sdk-only-in-adapters`). Adding a new external system = new port + adapter + mock in `adapters/mocks.ts` + container getter.
- The adapter maps SDK payloads to the port's types and throws `ExternalServiceError`; SDK error classes never reach a use case.
- Secrets come from `SecretsProvider`, resolved in the container — adapters don't read env.

## JobRunner → `JobQueue` port
```ts
// domain-services/ports.ts
export interface JobQueue { enqueue(workspaceId: string, kind: string, payload: unknown): Promise<{ id: string }>; }
```
- The use case enqueues via the port (`container.jobs` satisfies it structurally — inject it in `compose.ts`).
- The **handler** is infrastructure (`infrastructure/<kind>.job.ts`): `jobs.register(kind, raw => useCase.execute(Payload.parse(raw)))`. Registration happens in `compose.ts`/routes wiring, not inside a service constructor.

## SSE bus → `RunEvents` port
`publish(runId, kind, msg, data?)` behind an interface; routes subscribe to the bus for streaming. Use cases never import `platform/sse.ts`.

## Config
`platform/config.ts` (`loadConfig`) is the only `process.env` reader; pass the needed values (`cloneDir`, limits) into adapters/use cases as constructor args, not the whole `AppConfig` when one field is enough.

## Clock / ids
Time and random ids are side effects. If a rule depends on "now" (expiry, polling interval), inject a `Clock` port so domain tests are deterministic.
