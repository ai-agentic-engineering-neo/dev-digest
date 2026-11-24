/** Read a File as base64 (no data-URL prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

/** Only .md and .zip are accepted (mirrors the server's check; the server stays authoritative). */
export function isSupportedSkillFile(name: string): boolean {
  return /\.(md|zip)$/i.test(name);
}
