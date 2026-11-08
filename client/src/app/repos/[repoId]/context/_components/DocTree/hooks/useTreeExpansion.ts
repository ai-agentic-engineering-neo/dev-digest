import { useCallback, useEffect, useState } from "react";
import { STORAGE_PREFIX } from "../constants";

type Overrides = Record<string, boolean>;

function readOverrides(storageKey: string): Overrides {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Overrides = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "boolean") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** Per-repo expansion overrides persisted in localStorage. Sections default open, folders closed. */
export function useTreeExpansion(repoId: string): {
  isOpen: (key: string, isSection: boolean) => boolean;
  toggle: (key: string, isSection: boolean) => void;
} {
  const storageKey = STORAGE_PREFIX + repoId;
  const [overrides, setOverrides] = useState<Overrides>({});

  // Read after mount so the server render and the first client render match (hydration-safe).
  useEffect(() => {
    setOverrides(readOverrides(storageKey));
  }, [storageKey]);

  const isOpen = useCallback(
    (key: string, isSection: boolean) => overrides[key] ?? isSection,
    [overrides],
  );

  const toggle = useCallback(
    (key: string, isSection: boolean) => {
      const next = { ...overrides, [key]: !(overrides[key] ?? isSection) };
      setOverrides(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable: keep the in-memory state */
      }
    },
    [overrides, storageKey],
  );

  return { isOpen, toggle };
}
