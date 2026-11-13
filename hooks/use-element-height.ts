import { useEffect, useState } from "react";

// The element's current height in pixels, following its resizes; 0 until it is measured.
export function useElementHeight(element: HTMLElement | null): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.borderBoxSize[0].blockSize));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return height;
}
