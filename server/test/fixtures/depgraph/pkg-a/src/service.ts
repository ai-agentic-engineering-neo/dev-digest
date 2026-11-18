import type { Repo } from '@a/repo';
import { get, slug } from '@a/util';

export class Service {
  constructor(private repo: Repo) {}

  run(id: string): string {
    return this.repo.get(id);
  }
}

export function other(): number {
  return get(1) + slug('X').length;
}
