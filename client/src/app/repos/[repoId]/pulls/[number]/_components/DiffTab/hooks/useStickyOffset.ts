import { useEffect, useState } from "react";

const HEADER_SELECTOR = "[data-pr-detail-header]";

/** Height (px) of the sticky PrDetailHeader, so group headers can stick right below it. 0 when absent. */
export function useStickyOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const el = document.querySelector(HEADER_SELECTOR);
    if (!el) return;
    const measure = () => setOffset(el.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return offset;
}
