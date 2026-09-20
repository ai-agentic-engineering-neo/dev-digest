import { IMPORT_EXTENSIONS, IMPORT_MAX_BYTES } from "./constants";

/** Client-side upload guard: extension and size. Returns an error code or null. */
export function checkImportFile(file: { name: string; size: number }): "badType" | "tooLarge" | null {
  const lower = file.name.toLowerCase();
  if (!IMPORT_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "badType";
  if (file.size > IMPORT_MAX_BYTES) return "tooLarge";
  return null;
}

/** Reads a File as base64 (no data-URL prefix). */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}
