/**
 * Read a picked file as base64 for the JSON import endpoint.
 *
 * Why base64 over multipart: the payload is a couple of kilobytes of markdown
 * (or a small archive), and keeping one JSON content type means the import
 * route validates through the same Zod schema as everything else. The browser
 * never unpacks the archive — that is the server's job, and only for markdown.
 */
export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Chunked to keep the argument list under the engine's apply() limit for
  // files of a few hundred kilobytes.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
