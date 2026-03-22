import * as Crypto from "expo-crypto";

/**
 * Generate a URL-safe share token using expo-crypto (RN equivalent of Node's crypto.randomBytes).
 */
export async function generateShareToken(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(24);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
}
