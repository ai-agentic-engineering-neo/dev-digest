import { describe, it, expect } from 'vitest';
import { parseSymbols, parseReferences, parseImports, langForFile } from '../src/adapters/astgrep/index.js';

/**
 * Go language module — unit tests for the @ast-grep/lang-go-backed adapter.
 * Pure (in-memory parse, no DB/network). Mirrors astgrep.test.ts's coverage
 * shape but for the structurally-different Go grammar: no `export` keyword
 * (exported-ness is capitalization), receiver-based methods instead of
 * classes, `selector_expression` instead of `member_expression`.
 */
describe('langForFile (Go)', () => {
  it('recognizes .go and rejects everything else', () => {
    expect(langForFile('main.go')).toBeTruthy();
    expect(langForFile('main.GO')).toBeTruthy(); // case-insensitive
    expect(langForFile('main.py')).toBeNull();
  });
});

const SRC = `package main

import (
	"fmt"
	str "strings"
)

type Greeter struct {
	Name string
}

func (g *Greeter) Greet() string {
	return fmt.Sprintf("Hello, %s", str.ToUpper(g.Name))
}

type Speaker interface {
	Speak() string
}

func NewGreeter(name string) *Greeter {
	return &Greeter{Name: name}
}

func helper() {
	g := NewGreeter("world")
	fmt.Println(g.Greet())
}
`;

describe('parseSymbols (Go)', () => {
  const syms = parseSymbols('main.go', SRC);

  it('finds a plain function', () => {
    const s = syms.find((x) => x.name === 'NewGreeter');
    expect(s?.kind).toBe('function');
    expect(s?.exported).toBe(true);
  });

  it('dual-emits a pointer-receiver method: qualified AND bare', () => {
    const qualified = syms.find((x) => x.name === 'Greeter.Greet');
    const bare = syms.find((x) => x.name === 'Greet' && x.kind === 'method');
    expect(qualified).toBeTruthy();
    expect(bare).toBeTruthy();
    expect(qualified?.line).toBe(bare?.line);
  });

  it('maps a struct_type to kind "class"', () => {
    expect(syms.find((x) => x.name === 'Greeter' && x.kind !== 'method')?.kind).toBe('class');
  });

  it('maps an interface_type to kind "interface"', () => {
    expect(syms.find((x) => x.name === 'Speaker')?.kind).toBe('interface');
  });

  it('exported-ness is capitalization, not an AST fact', () => {
    const lower = parseSymbols('main.go', 'package main\nfunc helper() {}\n');
    expect(lower.find((x) => x.name === 'helper')?.exported).toBe(false);
    const upper = parseSymbols('main.go', 'package main\nfunc Helper() {}\n');
    expect(upper.find((x) => x.name === 'Helper')?.exported).toBe(true);
  });

  it('returns [] for a non-Go file', () => {
    expect(parseSymbols('main.py', SRC)).toEqual([]);
  });
});

describe('parseReferences (Go)', () => {
  it('resolves a selector_expression call (g.Greet()) via the field name', () => {
    const refs = parseReferences('main.go', SRC);
    expect(refs.some((r) => r.toSymbol === 'Greet')).toBe(true);
  });

  it('resolves a bare-identifier call', () => {
    const refs = parseReferences('main.go', SRC);
    expect(refs.some((r) => r.toSymbol === 'NewGreeter')).toBe(true);
  });

  it('does not count the declaration line as a reference', () => {
    const refs = parseReferences('main.go', SRC);
    const declLine = parseSymbols('main.go', SRC).find((s) => s.name === 'NewGreeter')!.line;
    expect(refs.some((r) => r.toSymbol === 'NewGreeter' && r.line === declLine)).toBe(false);
  });
});

describe('parseImports (Go)', () => {
  const imports = parseImports('main.go', SRC);

  it('resolves a plain import to its default (last-segment) binding name', () => {
    expect(imports).toContainEqual({ name: 'fmt', source: 'fmt', isType: false });
  });

  it('resolves an aliased import to its explicit alias', () => {
    expect(imports).toContainEqual({ name: 'str', source: 'strings', isType: false });
  });
});
