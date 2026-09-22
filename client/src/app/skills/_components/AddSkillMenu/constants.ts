/** File types the import accepts (server: .md / .markdown / .txt / .zip). */
export const IMPORT_ACCEPT = ".md,.markdown,.txt,.zip";

/** Largest upload: the server caps the base64 body at 2 MB (≈ 1.5 MB raw). */
export const MAX_IMPORT_BYTES = 1_500_000;
