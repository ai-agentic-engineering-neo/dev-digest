import { IMPORT_EXTENSIONS, KB, MAX_IMPORT_BYTES } from "./constants";

/** Why a picked file is refused before any request (message key under `skills.import`), or `null`. */
export function importFileError(file: { name: string; size: number }): "badType" | "tooLarge" | null {
  const name = file.name.toLowerCase();
  if (!IMPORT_EXTENSIONS.some((ext) => name.endsWith(ext))) return "badType";
  if (file.size > MAX_IMPORT_BYTES) return "tooLarge";
  return null;
}

/** A byte count's unit (message key under `skills.import.size`) and number: `512` B, `2.1` KB, `1.4` MB. */
export function formatBytes(bytes: number): { key: "bytes" | "kb" | "mb"; value: string } {
  if (bytes < KB) return { key: "bytes", value: String(bytes) };
  if (bytes < KB * KB) return { key: "kb", value: (bytes / KB).toFixed(1) };
  return { key: "mb", value: (bytes / (KB * KB)).toFixed(1) };
}
