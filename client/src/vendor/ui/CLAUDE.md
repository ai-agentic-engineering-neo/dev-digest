# src/vendor/ui/ — @devdigest/ui design system

Full component map, layers, and theming: [README.md](./README.md).

## The one rule
**Always import from the barrel `@devdigest/ui` (`index.ts`)** — never reach into
a layer file (`primitives/Button.tsx` etc.) directly. This is a vendored,
hand-copied library (not an npm package), so the barrel is the only stable surface.

## Non-default conventions
- One component per file, PascalCase; each layer folder has its own `index.ts`.
- No per-component stylesheets — inline styles keyed off CSS vars in `styles.css`.
- When you add or change a component, add it to the `/showcase` route
  (`src/components/showcase/Showcase.tsx`) — the smoke test mounts it and fails
  CI on a broken export.

## Links
[README](./README.md) · [client/CLAUDE.md](../../../CLAUDE.md) · [client/docs/](../../../docs/)
