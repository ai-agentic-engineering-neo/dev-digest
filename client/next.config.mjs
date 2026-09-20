import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
  // The vendored @devdigest/shared is NodeNext-style TypeScript (`from "./x.js"`
  // resolves to x.ts). Client code used to import only TYPES from it (erased at
  // build); importing a VALUE (e.g. the SkillInput zod schema for form validation)
  // needs webpack to map .js → .ts.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
