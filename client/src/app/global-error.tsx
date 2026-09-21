/* Last-resort boundary: catches errors thrown by the ROOT LAYOUT itself.

   This replaces the root layout, so it must render its own <html>/<body> — and
   critically, none of the layout's providers exist here. No next-intl, no theme,
   no React Query. Every string is inlined and every style is a literal on
   purpose: anything imported from the app could be what threw.

   data-theme="dark" matches the root layout's default so this doesn't flash
   white for dark-theme users. */
"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en" data-theme="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0d10",
          color: "#e6e8eb",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div role="alert" style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
            DevDigest failed to start
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.75, margin: "0 0 20px" }}>
            The application shell itself hit an error, so the usual UI could not be
            rendered. Reloading usually clears it.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, opacity: 0.5, margin: "0 0 20px" }}>
              Error digest: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              borderRadius: 6,
              border: "1px solid #2a2f37",
              background: "#151a21",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
