/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   (L03) inline finding markers. Public surface: the DiffViewer component +
   the DiffCommentApi / DiffFindingApi contracts. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export type { DiffFindingApi, InlineFindingCardProps } from "./findings";
