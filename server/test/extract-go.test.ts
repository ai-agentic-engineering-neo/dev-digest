import { describe, it, expect } from 'vitest';
import { extractGoSymbols, extractGoReferences } from '../src/adapters/codeindex/extract-go.js';

/**
 * Regex fallback extractor for Go — mirrors extract.test.ts's coverage shape.
 * This is the ALWAYS-available path when the AST route
 * (astgrep/langs/go.ts) is unavailable; unlike that path, it has no
 * exported-ness concept (ExtractedSymbol has no `exported` field — matches
 * the TS/JS fallback's shape too).
 */
describe('extractGoSymbols', () => {
  it('finds a function, a struct, an interface, and a pointer-receiver method', () => {
    const src = `
package main

type Greeter struct {
	Name string
}

func (g *Greeter) Greet() string {
	return g.Name
}

type Speaker interface {
	Speak() string
}

func NewGreeter(name string) *Greeter {
	return &Greeter{Name: name}
}
`;
    const syms = extractGoSymbols(src);
    const names = syms.map((s) => s.name);
    expect(names).toContain('Greeter');
    expect(names).toContain('Speaker');
    expect(names).toContain('NewGreeter');
    expect(names).toContain('Greet'); // bare
    expect(names).toContain('Greeter.Greet'); // qualified
    expect(syms.find((s) => s.name === 'Greeter')?.kind).toBe('class');
    expect(syms.find((s) => s.name === 'Speaker')?.kind).toBe('interface');
    expect(syms.find((s) => s.name === 'NewGreeter')?.kind).toBe('function');
  });

  it('ignores comment lines', () => {
    const src = `
// func notReal() {}
func real() {}
`;
    const names = extractGoSymbols(src).map((s) => s.name);
    expect(names).not.toContain('notReal');
    expect(names).toContain('real');
  });

  it('does not mistake a method for a plain function', () => {
    const src = `func (g *Greeter) Greet() string { return "" }\n`;
    const names = extractGoSymbols(src).map((s) => s.name);
    expect(names).not.toContain('Greet\n'); // sanity: no stray whitespace in the name
    expect(names).toContain('Greet');
    expect(names).toContain('Greeter.Greet');
  });
});

describe('extractGoReferences', () => {
  it('finds a selector-expression call site and excludes the declaration', () => {
    const src = `
func (g *Greeter) Greet() string { return g.Name }
func caller(g *Greeter) string { return g.Greet() }
`;
    const refs = extractGoReferences(src, 'Greeter.Greet');
    expect(refs.length).toBe(1);
    expect(refs[0]!.line).toBe(3);
  });

  it('finds a bare-identifier call site', () => {
    const src = `
func NewGreeter(name string) *Greeter { return &Greeter{Name: name} }
func caller() { g := NewGreeter("world"); _ = g }
`;
    const refs = extractGoReferences(src, 'NewGreeter');
    expect(refs.length).toBe(1);
    expect(refs[0]!.line).toBe(3);
  });
});
