export const DRAWER_WIDTH = 640;
/** Client-side courtesy check, mirroring the server's decoded-upload cap (§7.4)
 * so an oversized file fails fast instead of waiting on a round trip. */
export const MAX_UPLOAD_BYTES = 512 * 1024;
export const ACCEPT = ".md,.zip";
