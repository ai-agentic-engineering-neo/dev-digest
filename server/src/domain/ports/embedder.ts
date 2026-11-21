/** Port — source of truth is server/src/domain/ports (SPEC-16). */
export interface Embedder {
  /** OpenAI text-embedding-3-small → 1536 dims. */
  embed(texts: string[]): Promise<number[][]>;
  readonly dims: number;
}
