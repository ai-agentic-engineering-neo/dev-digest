export function get(key: number): number {
  return key + 1;
}

export function slug(text: string): string {
  return text.trim().toLowerCase();
}
