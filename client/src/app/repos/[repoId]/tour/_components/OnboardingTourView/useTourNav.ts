"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { SECTIONS } from "./constants";
import { sectionFromHash } from "./helpers";

/**
 * Table-of-contents state: scroll-spy over the five section anchors, click to
 * scroll, and the URL hash kept in sync with `router.replace`. `ready` flips to
 * true once the cards are in the DOM; the initial hash is scrolled to once.
 */
export function useTourNav(ready: boolean) {
  const router = useRouter();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const activeRef = React.useRef<string | null>(null);
  const initialDone = React.useRef(false);

  const activate = React.useCallback(
    (id: string) => {
      if (activeRef.current === id) return;
      activeRef.current = id;
      setActiveId(id);
      router.replace(`#${id}`, { scroll: false });
    },
    [router],
  );

  const select = React.useCallback(
    (id: string) => {
      document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      activate(id);
    },
    [activate],
  );

  React.useEffect(() => {
    if (!ready || initialDone.current) return;
    initialDone.current = true;
    const id = sectionFromHash(window.location.hash);
    if (id) {
      document.getElementById(id)?.scrollIntoView?.();
      activeRef.current = id;
      setActiveId(id);
    } else {
      activeRef.current = SECTIONS[0].id;
      setActiveId(SECTIONS[0].id);
    }
  }, [ready]);

  React.useEffect(() => {
    if (!ready || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = SECTIONS.find((s) => visible.has(s.id));
        if (first && initialDone.current) activate(first.id);
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ready, activate]);

  return { activeId, select };
}
