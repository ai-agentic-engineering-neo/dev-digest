import { Service } from '@a/service';
import type { Shape } from '@a/types';
import { LIMIT } from '@a/types';

export function start(repo: unknown, shape: Shape): number {
  return new Service(repo as never).run('x').length + shape.sides + LIMIT;
}
