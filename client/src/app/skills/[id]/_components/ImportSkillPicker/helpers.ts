/** Reads a File via FileReader and resolves to its content, base64-encoded
 *  (no `data:...;base64,` prefix) — the shape `/skills/import` expects. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected FileReader result"));
        return;
      }
      // readAsDataURL yields "data:<mime>;base64,<data>" — the API only wants <data>.
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
