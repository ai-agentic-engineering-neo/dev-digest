"use client";

import React from "react";

/** Renders a Mermaid diagram from its source.
 *  - Lazy-loads mermaid (heavy, ~server-only-unfriendly) via dynamic import, so
 *    it lands in a separate chunk fetched only when a diagram is present.
 *  - Re-renders on light/dark theme change.
 *  - Falls back to the raw source (never crashes the whole preview) on a parse
 *    error, so a malformed diagram still shows its text.
 *  Self-contained: reads the theme from <html data-theme> rather than app
 *  context, keeping the vendored UI kit decoupled. */
export function Mermaid({ chart }: { chart: string }) {
  const rawId = React.useId();
  const baseId = "mmd-" + rawId.replace(/[^a-zA-Z0-9-]/g, "");
  const seq = React.useRef(0);
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(true);
  const theme = useHtmlTheme();

  React.useEffect(() => {
    let cancelled = false;
    setPending(true);
    setError(null);

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: theme === "light" ? "default" : "dark",
        });
        // Unique id per render — mermaid.render() injects a temporary node keyed
        // by this id and rejects a collision (React StrictMode double-invokes).
        const { svg, bindFunctions } = await mermaid.render(`${baseId}-${seq.current++}`, chart);
        if (cancelled) return;
        if (hostRef.current) {
          hostRef.current.innerHTML = svg;
          bindFunctions?.(hostRef.current);
        }
        setPending(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPending(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, theme, baseId]);

  if (error) {
    // Don't lose information: surface the reason + the raw source.
    return (
      <div style={styles.errorWrap}>
        <div style={styles.errorMsg}>⚠ Diagram failed to render: {error}</div>
        <pre style={styles.pre}>
          <code className="mono" style={styles.code}>
            {chart}
          </code>
        </pre>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      {pending && <div style={styles.pending}>Rendering diagram…</div>}
      <div ref={hostRef} style={styles.host} aria-hidden={pending} />
    </div>
  );
}

// Track the current <html data-theme>, updating live on toggle.
function useHtmlTheme(): "dark" | "light" {
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  React.useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

const styles = {
  wrap: {
    margin: "0 0 12px",
    padding: "12px 14px",
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflowX: "auto" as const,
  } satisfies React.CSSProperties,
  host: {
    // Full width so mermaid's `width:100% / max-width:<natural>` SVG scales to
    // fit the container (and caps at natural size for small diagrams) instead
    // of collapsing inside a shrink-wrapping parent.
    width: "100%",
    textAlign: "center" as const,
  } satisfies React.CSSProperties,
  pending: {
    fontSize: "0.85em",
    color: "var(--text-muted)",
    padding: "8px 0",
  } satisfies React.CSSProperties,
  errorWrap: {
    margin: "0 0 12px",
    border: "1px solid var(--warn)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies React.CSSProperties,
  errorMsg: {
    fontSize: "0.82em",
    color: "var(--warn)",
    background: "var(--warn-bg)",
    padding: "6px 12px",
  } satisfies React.CSSProperties,
  pre: {
    margin: 0,
    padding: "12px 14px",
    background: "var(--code-bg)",
    overflowX: "auto" as const,
    fontSize: "0.85em",
    lineHeight: 1.5,
  } satisfies React.CSSProperties,
  code: {
    display: "block",
    whiteSpace: "pre" as const,
    color: "var(--text-primary)",
  } satisfies React.CSSProperties,
};
