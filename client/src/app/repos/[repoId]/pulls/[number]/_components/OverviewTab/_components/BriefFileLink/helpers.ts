/** `path:line` when a line is known, else `path`. */
export function fileLocation(path: string, line: number | null): string {
  return line === null ? path : `${path}:${line}`;
}
