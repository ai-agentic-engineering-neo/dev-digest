"use client";

/** Catches an error thrown by the root layout itself — the one case
    error.tsx can't handle, since error.tsx is rendered *inside* the root
    layout. Per Next.js convention this replaces the whole document, so it
    must render its own <html>/<body> and can't rely on layout providers
    (next-intl, theme, @devdigest/ui) — kept deliberately plain/hardcoded. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
          fontFamily: "system-ui, sans-serif",
          background: "#0f0f0f",
          color: "#e8e8e8",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>Something went wrong</div>
        <div style={{ fontSize: 14, color: "#999", maxWidth: 340, textAlign: "center", lineHeight: 1.5 }}>
          DevDigest hit an unexpected error loading the app. Try again, or reload the page.
        </div>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 8,
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #333",
            background: "#1c1c1c",
            color: "#e8e8e8",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
