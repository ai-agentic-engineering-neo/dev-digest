/** Pure encode step for D6's `{filename, content_b64}` body — reading the
 * `File` itself is a browser API call and stays in the component; this part
 * is pure and independently testable. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}
