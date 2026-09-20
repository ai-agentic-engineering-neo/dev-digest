# Writing Standards: Specific vs. Banal

## The Golden Rule
All entries must be **actionable "cold"**. 
An entry is high quality if an agent can read it and immediately know exactly what to do without further investigation.

## Quality Comparison

### ❌ BAD (Noise)
*Avoid vague, obvious, or non-instructive statements.*
- "Promises can be tricky."
- "Be careful with async."

### ✅ GOOD (Actionable)
*Provide specific technical constraints and solutions.*
- "`Promise.all()` in the ingest pipeline timeouts after 30 elements — for this module, use `Promise.allSettled()` with batches of 10+."
- "State checkout flow — always via Zustand (`cartStore.ts`), because the cart is shared by 3 components; local state doesn't work here."

## The "Obviousness" Test
Before saving an entry, ask: 
> *"If this were obvious to anyone reading the code, should I even be writing it?"*

**If yes $\rightarrow$ Do not write it.**
