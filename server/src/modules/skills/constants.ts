/** Skills module constants. */

/** Largest accepted upload (raw bytes). base64 of this stays under Fastify's 1 MiB bodyLimit. */
export const MAX_UPLOAD_BYTES = 512 * 1024;

/** Largest markdown entry we will decompress/read from an archive (zip-bomb guard). */
export const MAX_ENTRY_BYTES = 200 * 1024;

/** An archive with more entries than this is rejected before anything is read. */
export const MAX_ARCHIVE_ENTRIES = 200;

/** Preferred core file names inside an archive, best first (matched case-insensitively). */
export const CORE_FILE_NAME = 'skill.md';

/** Frontmatter `type:` values we accept; anything else falls back to `custom`. */
export const DEFAULT_IMPORT_TYPE = 'custom' as const;

/**
 * Phrases that read like instructions aimed at the model rather than review
 * guidance. A hit never blocks an import — it is surfaced in the preview so the
 * user reads the skill before it becomes part of an agent's prompt.
 */
export const SUSPICIOUS_PATTERNS: ReadonlyArray<{ re: RegExp; warning: string }> = [
  {
    re: /ignore\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|rules|prompts?)/i,
    warning: 'Tries to override earlier instructions ("ignore previous instructions").',
  },
  {
    re: /disregard\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|system)/i,
    warning: 'Tries to make the model disregard its system prompt.',
  },
  {
    re: /you\s+are\s+now\s+(?:a|an|the)\b/i,
    warning: 'Reassigns the model\'s role ("you are now …").',
  },
  {
    re: /(?:do\s+not|don'?t|never)\s+(?:tell|reveal|mention|disclose)\s+(?:the\s+)?user/i,
    warning: 'Asks the model to hide something from the user.',
  },
  {
    re: /(?:curl|wget)\s+[^\n|]*\|\s*(?:ba|z)?sh\b/i,
    warning: 'Contains a download-and-execute shell pattern.',
  },
  {
    re: /(?:send|post|upload|exfiltrate)\b[^\n]{0,60}\b(?:to|at)\s+https?:\/\//i,
    warning: 'Asks for data to be sent to an external URL.',
  },
];

/** More external links than this is called out as a warning. */
export const MAX_LINKS_BEFORE_WARNING = 3;
