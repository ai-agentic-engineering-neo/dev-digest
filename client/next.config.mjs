import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
  // `vendor/shared/index.ts` re-exports `./contracts/*.js` (NodeNext style), but
  // those files are `.ts` on disk. Without this alias webpack fails to resolve
  // them, so the client could import only TYPES from @devdigest/shared — hence
  // the hand-mirrored registries this removes. Keep it: dropping it silently
  // breaks every runtime (Zod schema) import from the shared package.
  webpack(config) {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

export default withNextIntl(nextConfig);
