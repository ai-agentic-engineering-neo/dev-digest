import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NEXT_PUBLIC_* values are inlined into the compiled chunks, so two `next dev`
  // servers sharing one build dir poison each other: the hermetic e2e stack
  // (API :3101) would leave its API base baked into the dev server's (:3001)
  // chunks. scripts/e2e.sh sets NEXT_DIST_DIR=.next-e2e to keep them apart.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
};

export default withNextIntl(nextConfig);
