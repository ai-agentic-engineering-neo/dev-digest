/** Per-document cap sent to the model, in tokens (AC-33). */
export const PROJECT_CONTEXT_DOC_MAX_TOKENS = 8000;
/** Cap on the summed document tokens of one assembled prompt (AC-34). */
export const PROJECT_CONTEXT_RUN_MAX_TOKENS = 24000;
/**
 * Largest listable/attachable file, in bytes of the blob. Equals the git adapter's
 * `SHOW_FILE_MAX_CHARS` (asserted in adapters.test.ts); modules cannot import adapters.
 */
export const PROJECT_CONTEXT_FILE_MAX_CHARS = 200_000;
/** Folder names a document's `kind` can take, and the discovery roots shown in the empty state. */
export const DISCOVERY_ROOTS = ['specs', 'docs', 'insights'] as const;
/** Parallel blob reads on a cold listing (each read spawns two git processes). */
export const LIST_READ_CONCURRENCY = 8;
/** Most paths one PUT may attach (matches the contract). */
export const MAX_ATTACHED_PATHS = 200;
/** Longest repo-relative path accepted. */
export const MAX_PATH_CHARS = 300;
/**
 * A whitespace-free run longer than this makes js-tiktoken quadratic, so such text
 * is counted with the chars/4 approximation instead of the tokenizer.
 */
export const PROJECT_CONTEXT_MAX_TOKEN_RUN_CHARS = 2_000;
/**
 * Body limit of PUT /repos/:id/context/file, in bytes: 200,000 characters, each up to
 * 6 bytes once JSON-escaped (`\uXXXX`), plus the envelope. The char cap decides, not the app's 1 MiB.
 */
export const OVERRIDE_BODY_LIMIT = 1_310_720;
