import type { ConfigContext, ExpoConfig } from "expo/config";

/** Release identities must belong to the publisher; local previews keep legacy IDs. */
export default function configureApp({ config }: ConfigContext): ExpoConfig {
  const production = process.env.EAS_BUILD_PROFILE === "production";
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
  const projectId = process.env.EAS_PROJECT_ID;
  const iosBundle = process.env.IOS_BUNDLE_IDENTIFIER;
  const androidPackage = process.env.ANDROID_PACKAGE;
  const origin = webUrl ? new URL(webUrl) : null;
  const linkedHost = origin?.protocol === "https:" ? origin.hostname : null;
  if (
    production &&
    (!linkedHost ||
      !projectId ||
      !iosBundle ||
      !androidPackage ||
      !process.env.EXPO_PUBLIC_SUPPORT_EMAIL)
  ) {
    throw new Error(
      "Production requires EXPO_PUBLIC_WEB_URL (owned HTTPS domain), EAS_PROJECT_ID, IOS_BUNDLE_IDENTIFIER, ANDROID_PACKAGE, and EXPO_PUBLIC_SUPPORT_EMAIL.",
    );
  }
  return {
    ...config,
    name: "Talli",
    slug: config.slug ?? "tabkind",
    // "talli" is the brand scheme; "tabkind" stays for the OAuth callback and
    // links already shared, "settleup" for the original links.
    scheme: ["talli", "tabkind", "settleup"],
    ios: {
      ...config.ios,
      ...(iosBundle ? { bundleIdentifier: iosBundle } : {}),
      ...(linkedHost ? { associatedDomains: [`applinks:${linkedHost}`] } : {}),
    },
    android: {
      ...config.android,
      ...(androidPackage ? { package: androidPackage } : {}),
      ...(linkedHost
        ? {
            intentFilters: [
              {
                action: "VIEW",
                autoVerify: true,
                category: ["BROWSABLE", "DEFAULT"],
                data: ["/join", "/claim", "/groups/"].map((pathPrefix) => ({
                  scheme: "https",
                  host: linkedHost,
                  pathPrefix,
                })),
              },
            ],
          }
        : {}),
    },
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
  };
}
