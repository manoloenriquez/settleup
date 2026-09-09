// Run with release environment variables, never print configured secret values.
const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
  "EXPO_PUBLIC_WEB_URL",
  "EXPO_PUBLIC_SUPPORT_EMAIL",
  "EAS_PROJECT_ID",
  "IOS_TEAM_ID",
  "IOS_BUNDLE_IDENTIFIER",
  "ANDROID_PACKAGE",
  "ANDROID_SHA256_CERT_FINGERPRINTS",
];
const failures = required.filter((key) => !process.env[key]).map((key) => `${key} is missing`);
const origins = new Map();
for (const key of ["NEXT_PUBLIC_APP_URL", "EXPO_PUBLIC_WEB_URL"]) {
  if (!process.env[key]) continue;
  try {
    const url = new URL(process.env[key]);
    origins.set(key, url.origin);
    if (
      url.protocol !== "https:" ||
      /localhost|127\.0\.0\.1|example\.(com|org)|settleup\.app/.test(url.hostname)
    )
      failures.push(`${key} must use your owned HTTPS domain`);
  } catch {
    failures.push(`${key} must be an absolute HTTPS URL`);
  }
}
if (origins.size === 2 && origins.get("NEXT_PUBLIC_APP_URL") !== origins.get("EXPO_PUBLIC_WEB_URL"))
  failures.push("Web and native link origins must match");
for (const key of ["NEXT_PUBLIC_SUPPORT_EMAIL", "EXPO_PUBLIC_SUPPORT_EMAIL"])
  if (process.env[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env[key]))
    failures.push(`${key} must be a valid mailbox`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Release settings present. Verify domain ownership, mailbox delivery, link files, store signing, and physical-device journeys before release.",
  );
