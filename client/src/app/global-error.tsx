/* Last-resort boundary: fires when the ROOT layout itself throws (e.g. i18n
   message loading). It replaces the layout, so it must render <html>/<body>
   and has no providers — hence plain markup and the one hard-coded English
   string set in the client (next-intl isn't available here). */
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
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0b0d10",
          color: "#e6e8eb",
        }}
      >
        <div role="alert" style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 16px", opacity: 0.75 }}>
            DevDigest failed to load. Try again, or reload the page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #3a3f47", background: "transparent", color: "inherit", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
