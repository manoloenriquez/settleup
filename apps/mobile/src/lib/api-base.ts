/**
 * Resolve the API root URL (no trailing slash). The API hosts account
 * closure only; every intelligence feature runs on the device.
 */
export function getApiBase(): string | null {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return null;
}
