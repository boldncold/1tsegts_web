import { useEffect } from 'react';

// Module-level counter so overlapping overlays (cart drawer + mobile nav)
// don't unlock the body while the other is still open.
let lockCount = 0;

/**
 * Locks page scrolling while `active` is true. Without this, scrolling
 * inside a fixed overlay chains to the page behind it on mobile — the
 * background visibly drags, and the browser toolbar collapse makes fixed
 * elements jump mid-scroll.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockCount += 1;
    if (lockCount === 1) document.body.style.overflow = 'hidden';
    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflow = '';
    };
  }, [active]);
}
