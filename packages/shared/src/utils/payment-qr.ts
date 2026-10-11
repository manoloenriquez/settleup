/** Storage bucket for payment QR images (public URLs, one folder per user). */
export const QR_BUCKET = "payment-qr";

/**
 * Image types clients may upload for payment QR codes. The bucket also accepts
 * the non-standard "image/jpg" that older app builds sent.
 */
export const QR_ALLOWED_MIME_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

export const MAX_QR_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const PUBLIC_MARKER = `/storage/v1/object/public/${QR_BUCKET}/`;

/**
 * The storage path behind a payment QR public URL, or null when the URL is not
 * a QR image in this user's own folder (never touch anyone else's file).
 */
export function qrStoragePath(publicUrl: string | null | undefined, userId: string): string | null {
  if (!publicUrl || !userId) return null;
  const at = publicUrl.indexOf(PUBLIC_MARKER);
  if (at === -1) return null;
  const raw = publicUrl.slice(at + PUBLIC_MARKER.length).split(/[?#]/)[0] ?? "";
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!path.startsWith(`${userId}/`) || path.includes("..")) return null;
  return path;
}

/**
 * QR objects to delete after a save: everything previously stored or uploaded
 * that the saved profile no longer points at.
 */
export function staleQrPaths(
  candidates: readonly (string | null | undefined)[],
  kept: readonly (string | null | undefined)[],
  userId: string,
): string[] {
  const keep = new Set(kept.map((url) => qrStoragePath(url, userId)).filter((p): p is string => p !== null));
  const stale = new Set<string>();
  for (const url of candidates) {
    const path = qrStoragePath(url, userId);
    if (path && !keep.has(path)) stale.add(path);
  }
  return [...stale];
}
