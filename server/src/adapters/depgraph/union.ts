/**
 * Composes per-language depgraph builders (Phase 3's polyglot design, see
 * docs/go-language-support-plan.md). Each builder gets the same full,
 * multi-language file list and internally filters to its own language
 * (DepCruiseGraph already does this for TS/JS; GoDepGraph mirrors it for
 * Go) — so cross-language edges are never produced. PageRank treats the
 * resulting disjoint TS and Go subgraphs as separate components with no
 * special-casing needed in rank.ts.
 */
import { DepCruiseGraph, type DepGraph, type FileEdge } from './index.js';
import { GoDepGraph } from './go.js';

export class UnionDepGraph implements DepGraph {
  private readonly builders: readonly DepGraph[];

  constructor(builders: readonly DepGraph[] = [new DepCruiseGraph(), new GoDepGraph()]) {
    this.builders = builders;
  }

  async buildEdges(root: string, files: string[]): Promise<FileEdge[]> {
    const results = await Promise.all(this.builders.map((b) => b.buildEdges(root, files)));
    return results.flat();
  }
}
