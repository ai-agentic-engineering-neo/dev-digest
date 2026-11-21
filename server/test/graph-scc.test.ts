import { describe, it, expect } from 'vitest';
import { findCycles, summarizeCycles } from '../src/modules/repo-intel/graph/scc.js';

const e = (from: string, to: string) => ({ from, to });

describe('findCycles (iterative Tarjan)', () => {
  it('returns nothing for a DAG', () => {
    expect(findCycles([e('a', 'b'), e('b', 'c'), e('a', 'c')])).toEqual([]);
  });

  it('finds a simple 2-cycle and a 3-cycle, ignoring self-edges', () => {
    const comps = findCycles([
      e('a', 'b'), e('b', 'a'),
      e('x', 'y'), e('y', 'z'), e('z', 'x'),
      e('q', 'q'),
      e('a', 'x'),
    ]);
    expect(comps.map((c) => c.join(',')).sort()).toEqual(['a,b', 'x,y,z']);
  });

  it('handles a 100k-long chain closed into one cycle without overflowing the stack', () => {
    const n = 100_000;
    const edges = Array.from({ length: n }, (_, i) => e(`f${i}`, `f${(i + 1) % n}`));
    const comps = findCycles(edges);
    expect(comps).toHaveLength(1);
    expect(comps[0]).toHaveLength(n);
  });

  it('is deterministic regardless of edge order', () => {
    const edges = [e('b', 'c'), e('a', 'b'), e('c', 'a'), e('d', 'e'), e('e', 'd')];
    expect(findCycles(edges)).toEqual(findCycles([...edges].reverse()));
  });
});

describe('summarizeCycles caps', () => {
  it('caps SCC count and member lists but keeps totals', () => {
    const comps = Array.from({ length: 120 }, (_, i) => [`a${i}`, `b${i}`, `c${i}`]);
    comps.push(Array.from({ length: 80 }, (_, i) => `big${String(i).padStart(2, '0')}`));
    const s = summarizeCycles(comps, 100, 50);
    expect(s.total).toBe(121);
    expect(s.items).toHaveLength(100);
    expect(s.items[0]!.size).toBe(80); // largest first
    expect(s.items[0]!.members).toHaveLength(50);
    expect(s.items[0]!.membersTruncated).toBe(true);
    expect(s.items[1]!.membersTruncated).toBe(false);
    // cycleFiles counts ALL members, not just the listed ones
    expect(s.cycleFiles.size).toBe(120 * 3 + 80);
  });
});
