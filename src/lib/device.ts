/**
 * True on phones/tablets — devices that can open bank-app deeplinks.
 *
 * Used to pick the primary QPay action: on mobile we push "open the app"
 * (a QR shown on the same phone can't be scanned by it), on desktop the QR
 * is the payment. User-agent based rather than viewport based on purpose —
 * a narrow desktop window still can't open `khanbank://`.
 */
export function isMobileDevice(): boolean {
  // UA-Client-Hints when available (Chromium); falls back to a UA sniff.
  const uaData = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData && typeof uaData.mobile === 'boolean') return uaData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
