import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
  experimental: {
    // The vendored @devdigest/shared contracts (mirrored 1:1 from the
    // server's NodeNext-style ESM sources under src/vendor/shared) use
    // explicit `.js` specifiers on relative imports whose actual files are
    // `.ts` — tsc/tsx resolve that natively, but webpack doesn't unless told
    // to. Previously latent (client code only ever `import type`-ed these
    // contracts, which is erased before bundling); surfaced once a hook took
    // a real runtime import of a Zod schema for response validation.
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
    },
  },
};

export default withNextIntl(nextConfig);
