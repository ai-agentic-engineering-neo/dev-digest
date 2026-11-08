/* doc-markdown helpers — remark plugin that keeps raw HTML visible as text. */

/** Minimal mdast node shape (mdast types are not a direct client dependency). */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

function htmlToText(node: MdNode): void {
  if (node.type === "html") node.type = "text";
  node.children?.forEach(htmlToText);
}

/**
 * Remark plugin: every raw-HTML node (`html`, block or inline) becomes a `text` node with the same
 * value, so `<b>x</b><script>…</script>` in an untrusted doc is SHOWN as literal text — never
 * executed, never silently dropped. No rehype-raw, no dangerouslySetInnerHTML.
 */
export function remarkHtmlAsText() {
  return (tree: MdNode): void => {
    htmlToText(tree);
  };
}

/** Fenced code keeps its trailing newline / language class; inline code has neither. */
export function isBlockCode(className: string | undefined, text: string): boolean {
  return /\blanguage-/.test(className ?? "") || text.includes("\n");
}
