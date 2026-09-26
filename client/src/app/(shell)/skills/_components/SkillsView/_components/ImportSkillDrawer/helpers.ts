/** Read a File's raw bytes and base64-encode them for POST /skills/import/preview
   ({filename, content_base64}). Uses FileReader.readAsArrayBuffer rather than
   File.prototype.arrayBuffer() — jsdom's File implementation (this repo's test
   environment) does not implement arrayBuffer(), only the FileReader path. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      resolve(btoa(binary));
    };
    reader.readAsArrayBuffer(file);
  });
}
