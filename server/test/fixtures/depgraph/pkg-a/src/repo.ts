export interface Repo {
  get(id: string): string;
  put(id: string, value: string): void;
}
