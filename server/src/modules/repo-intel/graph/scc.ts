/**
 * Pure, iterative Tarjan strongly-connected-components over the file import
 * graph (specs/18 AC-49). Iterative on purpose: a 5000-file repo with a long
 * import chain would overflow the JS call stack with the recursive form.
 */

export interface DirectedEdge {
  from: string;
  to: string;
}

export interface CycleSummary {
  /** Components of size > 1, largest first (then by first member), capped. */
  items: Array<{ size: number; members: string[]; membersTruncated: boolean }>;
  /** Total number of components of size > 1 (before the cap). */
  total: number;
  /** Every file that sits in some cycle. */
  cycleFiles: Set<string>;
}

/** All SCCs with more than one member (a single node is not a cycle here). */
export function findCycles(edges: readonly DirectedEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const { from, to } of edges) {
    if (from === to) continue; // self-import is not a cross-file cycle
    let out = adj.get(from);
    if (!out) adj.set(from, (out = []));
    out.push(to);
    if (!adj.has(to)) adj.set(to, []);
  }

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];
  let counter = 0;

  // Deterministic order: results must not depend on edge-insertion order.
  const roots = [...adj.keys()].sort();
  for (const root of roots) {
    if (index.has(root)) continue;
    const work: Array<{ node: string; next: number }> = [{ node: root, next: 0 }];
    index.set(root, counter);
    low.set(root, counter);
    counter++;
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const neighbours = adj.get(frame.node)!;
      if (frame.next < neighbours.length) {
        const w = neighbours[frame.next++]!;
        if (!index.has(w)) {
          index.set(w, counter);
          low.set(w, counter);
          counter++;
          stack.push(w);
          onStack.add(w);
          work.push({ node: w, next: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(w)!));
        }
        continue;
      }
      // Frame exhausted: close the component if this node is its root.
      work.pop();
      const v = frame.node;
      if (low.get(v) === index.get(v)) {
        const comp: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          comp.push(w);
        } while (w !== v);
        if (comp.length > 1) result.push(comp.sort());
      }
      const parent = work[work.length - 1];
      if (parent) {
        low.set(parent.node, Math.min(low.get(parent.node)!, low.get(v)!));
      }
    }
  }
  return result;
}

/** Cap the SCC list (≤ maxCycles) and each member list (≤ maxMembers). */
export function summarizeCycles(
  components: readonly string[][],
  maxCycles: number,
  maxMembers: number,
): CycleSummary {
  const sorted = [...components].sort(
    (a, b) => b.length - a.length || (a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0),
  );
  const cycleFiles = new Set<string>();
  for (const comp of sorted) for (const f of comp) cycleFiles.add(f);
  return {
    items: sorted.slice(0, maxCycles).map((comp) => ({
      size: comp.length,
      members: comp.slice(0, maxMembers),
      membersTruncated: comp.length > maxMembers,
    })),
    total: sorted.length,
    cycleFiles,
  };
}
