import { slug } from '@a/util';

const registry = new Map<string, string>();

export function boot(name: string): string {
  const id = slug(name);
  registry.set(id, name);
  return id;
}

registry.set('init', 'init');
