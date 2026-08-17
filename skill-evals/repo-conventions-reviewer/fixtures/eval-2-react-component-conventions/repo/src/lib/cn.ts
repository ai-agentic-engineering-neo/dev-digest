export function cn(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
