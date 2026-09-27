/**
 * Language chips in the community tab; `any` clears the filter.
 * Only values the bundled catalog actually carries — a filter that can never
 * match anything is a bug report waiting to happen.
 */
export const LANGUAGE_FILTERS = ["any", "TypeScript"] as const;

/** Largest upload the API accepts (mirrors MAX_UPLOAD_BYTES on the server). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
