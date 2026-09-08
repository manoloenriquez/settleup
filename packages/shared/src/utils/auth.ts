/** Keep authentication return URLs on known application routes. */
export function safeReturnPath(value: unknown, fallback = "/dashboard"): string {
  if (
    typeof value !== "string" ||
    value.length > 2000 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    Array.from(value).some((char) => char === "\\" || char.charCodeAt(0) <= 32)
  )
    return fallback;
  try {
    const url = new URL(value, "https://app.invalid");
    if (url.origin !== "https://app.invalid") return fallback;
    const allowed =
      /^(?:\/dashboard|\/groups(?:\/[^/]+(?:\/settings|\/insights)?)?|\/join|\/claim|\/account(?:\/payment)?|\/activity|\/update-password)$/;
    if (!allowed.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
