/** Read a File as base64 (no data-URL prefix) for `POST /skills/import/preview`. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/** Accepted upload extensions (mirrors the server's parser). */
export const ACCEPT = ".md,.markdown,.txt,.zip";
