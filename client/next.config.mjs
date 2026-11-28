import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
const isDev = process.env.NODE_ENV !== "production";

/**
 * S4 (security hardening) — the page renders untrusted markdown
 * (LLM rationale, PR comments, repo docs). `img-src` and `connect-src` close
 * the channel an injected `<img>`/fetch would use to send data off-box.
 *
 * `script-src`/`style-src` are deliberately not restricted here: Next's dev
 * server needs `'unsafe-eval'` and mermaid injects inline styles, so a strict
 * script policy needs nonces and is a separate change.
 */
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  // `ws:` only in dev, for Next's HMR socket.
  `connect-src 'self' ${API_BASE}${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Keep inline/eval scripts working (see above) while still pinning origin.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: API_BASE,
  },
  webpack(config) {
    // `@devdigest/shared` re-exports `./contracts/*.js` from `.ts` sources; let
    // webpack resolve the `.js` specifier to the TypeScript file.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
