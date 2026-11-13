"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "saved" | "unsaved" | "saving" | "failed";

// Saves with the latest save function a while after the last change. Saves run one at a time in
// order, so a save never overtakes an earlier one (e.g. an update the creation it depends on).
// A pending save is done right away on flush and when the component unmounts.
export function useAutoSave(save: () => Promise<boolean>, delay = 1000) {
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  // Changes made; a save that ends with no newer changes leaves everything saved.
  const changes = useRef(0);
  const [status, setStatus] = useState<AutoSaveStatus>("saved");

  const saveNow = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const saving = changes.current;
    setStatus("saving");
    queue.current = queue.current.then(async () => {
      const saved = await saveRef.current().catch(() => false);
      if (!saved) setStatus("failed");
      else if (changes.current === saving && !timer.current) setStatus("saved");
      return saved;
    });
    return queue.current;
  }, []);

  // A change to save after the delay.
  const change = useCallback(() => {
    changes.current++;
    setStatus("unsaved");
    clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, delay);
  }, [saveNow, delay]);

  // Saves a pending change now; resolves once every save is done, to whether the last one succeeded.
  const flush = useCallback(() => (timer.current ? saveNow() : queue.current), [saveNow]);

  useEffect(
    () => () => {
      if (timer.current) saveNow();
    },
    [saveNow],
  );

  return { status, change, saveNow, flush };
}
