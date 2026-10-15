import { useEffect, useRef } from 'react';

/** Calls `onEscape` when Escape is pressed while `active` — for drawers, sheets and dialogs. */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  // Read the latest callback without re-binding the listener on every render.
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}
