import { add } from '~/math';
import type { Pair } from '~/index';

export function total(p: Pair): number {
  return add(p.a, p.b);
}
