/** Canonical origin; never trust a submitted Host header for auth emails. */
export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured && process.env.NODE_ENV === "production")
    throw new Error("NEXT_PUBLIC_APP_URL is required");
  const url = new URL(configured ?? "http://localhost:3000");
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new Error("Invalid application origin");
  return url.origin;
}
