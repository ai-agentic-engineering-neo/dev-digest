import { SHORT_PATH_SEGMENTS } from "./constants";

/** Long path → its last segments behind an ellipsis: `client/src/…/FileCard/FileCard.tsx` → `…/FileCard/FileCard.tsx`. */
export function shortPath(file: string, keep = SHORT_PATH_SEGMENTS): string {
  const parts = file.split("/").filter(Boolean);
  return parts.length <= keep ? file : `…/${parts.slice(-keep).join("/")}`;
}
