/** Largest raw file the client sends (1 MB); the server's preview route allows 1.5 MB of base64. */
export const MAX_IMPORT_BYTES = 1_048_576;

/** File extensions the import accepts. */
export const IMPORT_EXTENSIONS = [".md", ".zip"] as const;

/** `accept` attribute of the file input. */
export const IMPORT_ACCEPT = IMPORT_EXTENSIONS.join(",");

/** Bytes per kilobyte, for size labels. */
export const KB = 1024;
