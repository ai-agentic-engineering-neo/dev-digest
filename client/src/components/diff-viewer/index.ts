/* diff-viewer — unified-diff viewer with optional inline GitHub comments and agent findings.
   Public surface: the DiffViewer component + the DiffCommentApi / DiffFindingApi contracts. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export type { DiffFindingApi, DiffFindingLabels } from "./findings";
export { AUTO_EXPAND_MAX_LINES } from "./constants";
