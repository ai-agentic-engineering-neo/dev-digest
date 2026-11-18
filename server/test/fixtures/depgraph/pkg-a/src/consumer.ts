import Thing from './default-thing';
import anon from './anon';
import * as util from './util';
import { type Id, Color, LIMIT, type Shape as S } from './types';
import { parse } from './overloads';
import type { Env } from './globals';
import { Svc, only1, dup } from './index';
import { fromY } from './cycle-x';

export function useShape(shape: S): Id {
  return shape.id;
}

export function useAll(env: Env): unknown {
  const t = new Thing();
  return [t, anon(), util.slug('a'), Color.Red, LIMIT, parse('x'), env.mode, Svc, only1, dup, fromY];
}
