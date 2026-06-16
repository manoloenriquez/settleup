/**
 * Resolve the API root URL (no trailing slash).
 *
 * Reads EXPO_PUBLIC_API_URL first, falling back to deriving from the legacy
 * EXPO_PUBLIC_AI_API_URL (which points at `<root>/ai`).
 */
export function getApiBase(): string | null {
  const explicit = process.env["EXPO_PUBLIC_API_URL"];
  if (explicit) return explicit.replace(/\/$/, "");

  const aiUrl = process.env["EXPO_PUBLIC_AI_API_URL"];
  if (aiUrl) return aiUrl.replace(/\/ai\/?$/, "").replace(/\/$/, "");

  return null;
}

export function getAiApiBase(): string | null {
  const explicit = process.env["EXPO_PUBLIC_AI_API_URL"];
  if (explicit) return explicit.replace(/\/$/, "");

  const apiBase = getApiBase();
  if (!apiBase) return null;

  return `${apiBase}/ai`;
}
