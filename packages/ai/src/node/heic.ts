/**
 * Convert HEIC/HEIF image buffers to JPEG.
 * Uses heic-convert (pure JS, no native deps).
 * Dynamically imported to avoid loading when not needed.
 */
export async function convertHeicToJpeg(
  buffer: Buffer,
): Promise<{ buffer: Buffer; mimeType: string }> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore heic-convert does not ship typed ESM declarations
  const convert = (await import("heic-convert")).default;
  const outputBuffer = await convert({
    buffer,
    format: "JPEG",
    quality: 0.9,
  });
  return { buffer: Buffer.from(outputBuffer), mimeType: "image/jpeg" };
}
