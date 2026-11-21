/** Port — source of truth is server/src/domain/ports (SPEC-16). */
export interface Tokenizer {
  count(text: string): number;
}
