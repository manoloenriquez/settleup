import { randomBytes } from "crypto";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generate a cryptographically random Base62 token.
 * Server-only — uses Node.js crypto, not available in React Native.
 * Default length 22 gives ~131 bits of entropy.
 */
export function generateShareToken(length = 22): string {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARS[bytes[i]! % CHARS.length];
  }
  return result;
}
