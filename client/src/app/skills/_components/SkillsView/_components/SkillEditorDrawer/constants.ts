/** Client-side cap for an uploaded skill file (the server enforces its own). */
export const IMPORT_MAX_KB = 512;
export const IMPORT_MAX_BYTES = IMPORT_MAX_KB * 1024;
export const IMPORT_ACCEPT = ".md,.zip";
export const IMPORT_EXTENSIONS = [".md", ".zip"] as const;
