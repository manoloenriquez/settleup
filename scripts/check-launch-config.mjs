// Run with release environment variables, never print configured secret values.
//
// Presence checks only: passing proves the release environment is populated,
// not that the domain is owned, the mailbox delivers, or native links verify.
const required = [
  // Public identities
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
  "EXPO_PUBLIC_WEB_URL",
  "EXPO_PUBLIC_SUPPORT_EMAIL",
  "EAS_PROJECT_ID",
  "IOS_TEAM_ID",
  "IOS_BUNDLE_IDENTIFIER",
  "ANDROID_PACKAGE",
  "ANDROID_SHA256_CERT_FINGERPRINTS",
  // Data backend
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  // AI/account API service
  "EXPO_PUBLIC_API_URL",
  "API_URL",
  "ALLOWED_ORIGINS",
];
const forbidden = ["SUPABASE_SERVICE_ROLE_KEY"];
const monitoring = [
  ["web", ["NEXT_PUBLIC_SENTRY_DSN"]],
  ["web server", ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]],
  ["mobile", ["EXPO_PUBLIC_SENTRY_DSN"]],
  ["api", ["SENTRY_DSN"]],
];

const failures = required.filter((key) => !process.env[key]).map((key) => `${key} is missing`);
const warnings = [];

for (const key of forbidden)
  if (process.env[key])
    failures.push(`${key} must not be present in the release environment (no service-role use remains)`);

const placeholderHost = /localhost|127\.0\.0\.1|example\.(com|org)|settleup\.app|your-owned-domain/;
const origins = new Map();
for (const key of ["NEXT_PUBLIC_APP_URL", "EXPO_PUBLIC_WEB_URL", "EXPO_PUBLIC_API_URL", "API_URL"]) {
  if (!process.env[key]) continue;
  try {
    const url = new URL(process.env[key]);
    origins.set(key, url.origin);
    if (url.protocol !== "https:" || placeholderHost.test(url.hostname))
      failures.push(`${key} must use your owned HTTPS domain`);
  } catch {
    failures.push(`${key} must be an absolute HTTPS URL`);
  }
}
if (origins.size >= 2 && origins.has("NEXT_PUBLIC_APP_URL") && origins.has("EXPO_PUBLIC_WEB_URL"))
  if (origins.get("NEXT_PUBLIC_APP_URL") !== origins.get("EXPO_PUBLIC_WEB_URL"))
    failures.push("Web and native link origins must match");

for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"]) {
  if (!process.env[key]) continue;
  try {
    const url = new URL(process.env[key]);
    if (url.protocol !== "https:") failures.push(`${key} must be an HTTPS URL`);
  } catch {
    failures.push(`${key} must be an absolute HTTPS URL`);
  }
}
if (
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.EXPO_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== process.env.EXPO_PUBLIC_SUPABASE_URL
)
  failures.push("Web and mobile must point at the same Supabase project");

if (process.env.ALLOWED_ORIGINS) {
  const allowed = process.env.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const origin of allowed) {
    try {
      const url = new URL(origin);
      if (url.protocol !== "https:" || placeholderHost.test(url.hostname))
        failures.push(`ALLOWED_ORIGINS entry ${origin} must be an owned HTTPS origin`);
    } catch {
      failures.push(`ALLOWED_ORIGINS entry ${origin} must be an absolute origin`);
    }
  }
  const webOrigin = origins.get("NEXT_PUBLIC_APP_URL");
  if (webOrigin && !allowed.includes(webOrigin))
    failures.push("ALLOWED_ORIGINS must include the web origin");
}

for (const key of ["NEXT_PUBLIC_SUPPORT_EMAIL", "EXPO_PUBLIC_SUPPORT_EMAIL"])
  if (process.env[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env[key]))
    failures.push(`${key} must be a valid mailbox`);

if (process.env.NODE_ENV !== "production")
  warnings.push("NODE_ENV is not production: the API reflects exp:// origins and Sentry stays disabled");
if (process.env.LLM_ENABLED !== "true" && process.env.LLM_ENABLED !== "false")
  warnings.push("LLM_ENABLED is not an explicit true/false; AI stays off unless it is exactly \"true\"");
for (const [surface, keys] of monitoring)
  if (!keys.some((key) => process.env[key]))
    warnings.push(`No Sentry DSN for ${surface}; production errors there will not be reported`);

if (warnings.length) console.warn(warnings.map((line) => `warning: ${line}`).join("\n"));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Release settings present. Verify domain ownership, mailbox delivery, link files, store signing, and physical-device journeys before release.",
  );
