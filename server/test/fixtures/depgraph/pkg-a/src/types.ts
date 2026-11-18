export type Id = string;

export interface Shape {
  id: Id;
  sides: number;
}

export enum Color {
  Red,
  Green,
}

export const LIMIT = 10;
