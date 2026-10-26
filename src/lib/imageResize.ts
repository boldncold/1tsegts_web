/**
 * Small copies of dish photos for tiles, cards and list rows (stored as
 * `thumb` on the menu item, see convex/schema.ts).
 *
 * Why 480px: the largest small slot is the desktop featured card (240 CSS px);
 * 480 covers it on 2x screens and a phone tile (~190 CSS px) on 2.5x screens.
 * The full 800px photo stays for places that show a dish large.
 */
export const THUMB_MAX_PX = 480;
const THUMB_QUALITY = 0.72;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Stored photos come from the Convex domain. Without CORS mode the canvas
    // would be "tainted" and refuse to export the resized copy.
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src.slice(0, 80)}`));
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Resize a photo (a data URL or an http(s) URL) so its longer side is at
 * most `maxPx`. WebP when the browser can encode it (about a third smaller
 * than JPEG at the same quality), JPEG otherwise. Browsers that can't encode
 * WebP silently return PNG, which is several times larger, hence the check.
 */
export async function resizeImage(src: string, maxPx = THUMB_MAX_PX, quality = THUMB_QUALITY): Promise<Blob> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg', quality);
  if (!jpeg) throw new Error('Could not encode the resized image');
  return jpeg;
}
