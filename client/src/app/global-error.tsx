/* Last-resort boundary: catches throws in the ROOT LAYOUT itself, which
   `app/error.tsx` cannot — that one renders *inside* the layout.

   Two constraints follow from replacing the root layout, and both are why this
   file looks unlike every other component here:
     1. It must render its own <html> and <body>.
     2. Nothing the layout set up exists — `globals.css` is imported there, so
        the design-system tokens (var(--bg-primary), …) resolve to NOTHING, and
        NextIntlClientProvider is absent so `useTranslations` would throw
        *inside the error boundary*. Hence literal hex colours and literal
        English copy: this page must render with zero dependencies.

   Values are the dark-theme tokens from vendor/ui/styles.css, matching the
   app's default `data-theme="dark"`. */
"use client";

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "60px 28px",
          textAlign: "center",
          background: "#0a0a0a",
          color: "#ededed",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>DevDigest failed to start</div>
        <div style={{ fontSize: 14, color: "#999999", maxWidth: 380, lineHeight: 1.5 }}>
          The application shell itself hit an error, so the usual interface could not be
          drawn. Reloading is the fastest fix; if it persists, check the server logs.
        </div>
        {(error.message || error.digest) && (
          <div
            style={{
              fontSize: 12,
              color: "#6a6a6a",
              maxWidth: 460,
              marginTop: 4,
              overflowWrap: "anywhere",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {error.message || error.digest}
          </div>
        )}
        <button
          onClick={() => reset()}
          style={{
            marginTop: 16,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 500,
            color: "#ededed",
            background: "#1c1c1c",
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
