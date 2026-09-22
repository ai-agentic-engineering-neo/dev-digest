/* CodeMirrorField — the CodeMirror 6 markdown editor itself. Loaded only via
   next/dynamic (ssr:false) from BodyEditor, so CodeMirror ships only with the
   skill editor route. The theme reads the app's CSS variables, so it follows
   light/dark without a second theme. */
"use client";

import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";

const cssVarTheme = EditorView.theme({
  "&": { backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: "13px" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--text-primary)", padding: "10px 0" },
  ".cm-gutters": {
    backgroundColor: "var(--bg-surface)",
    color: "var(--text-muted)",
    borderRight: "1px solid var(--border)",
    fontFamily: "var(--font-mono)",
  },
  ".cm-activeLine": { backgroundColor: "var(--bg-hover)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text-primary)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-bg)",
  },
});

const EXTENSIONS = [markdown(), EditorView.lineWrapping, cssVarTheme];
const SETUP = { lineNumbers: true, foldGutter: false, highlightActiveLine: true, autocompletion: false } as const;

export default function CodeMirrorField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <CodeMirror
      value={value}
      onChange={(v) => onChange(v)}
      extensions={EXTENSIONS}
      basicSetup={SETUP}
      theme="none"
      minHeight="320px"
      aria-label={label}
    />
  );
}
