/**
 * Generates a short, typo-safe reference code for bank-transfer orders.
 * The code is shown to the customer, who types it into the "description"
 * field of their bank transfer. It later becomes the matching key when we
 * automate reconciliation (email parsing / bank API).
 *
 * Alphabet drops characters that look alike in handwriting and on screens:
 *   - 0 vs O
 *   - 1 vs I vs L
 * 6 random chars over a 31-char alphabet → ~26 bits of entropy.
 * Collision odds are negligible at restaurant volume.
 */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PREFIX = 'GR-'; // "Grand" — also makes the code visually unmistakable in the bank memo

export function generateReferenceCode(): string {
  // crypto is preferred over Math.random for low collision risk.
  // Available in browsers and modern Node, no need for an import in Vite.
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let code = PREFIX;
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return code;
}

/** Validates a reference code's shape (does NOT check existence in DB). */
export function isValidReferenceCode(code: string): boolean {
  return /^GR-[2-9A-Z&&[^OIL01]]{6}$/.test(code) || /^GR-[A-Z2-9]{6}$/.test(code);
}
