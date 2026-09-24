import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // `@devdigest/shared` (src/vendor/shared) is NodeNext-style TS shared with the
  // server: its barrel re-exports `./contracts/*.js`. Map `.js` specifiers to
  // the `.ts` sources so runtime values (schemas, FEATURE_MODELS) can be
  // imported from it, not just types.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
