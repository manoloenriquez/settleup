# TestFlight — Talli (iOS)

| | |
|---|---|
| App Store Connect name | Talli: Split Bills |
| Home-screen name | Talli |
| Bundle ID | `com.manoloenriquez.talli` (registered by Xcode automatic signing) |
| Team | `L8Y7B5Z7EQ`, Apple ID manolo.enriquez@icloud.com |
| Minimum iOS | 27.0, iPhone only |
| SKU | `talli-ios` |

## One-time setup in App Store Connect (owner)

1. **Apps → + → New App**: iOS, name *Talli: Split Bills*, primary language English, bundle ID `com.manoloenriquez.talli`, SKU `talli-ios`, full access.
2. **App Privacy** (required before external testing). Data the app collects, all linked to the user and not used for tracking:
   - Contact info: email address (account sign-in).
   - User content: expense, group, payment and note data you enter (stored in Supabase).
   - Identifiers: user ID.
   - Usage data: first-party product events (`settleup.product_events`, enumerated properties only).
   - Diagnostics: crash data only when a Sentry DSN is configured.
   Receipt photos and AI processing stay on the device and are **not** collected.
3. **TestFlight → Test Information**: beta description, feedback email, and a privacy policy URL (the web app's `/privacy` page) for external testers.
4. Export compliance is answered in the build (`ITSAppUsesNonExemptEncryption = NO`).

## Build and upload

```bash
cd apps/mobile
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 SENTRY_DISABLE_AUTO_UPLOAD=true
npx expo prebuild --platform ios --clean --no-install && (cd ios && pod install)
cd ios
xcodebuild -workspace Talli.xcworkspace -scheme Talli -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Talli.xcarchive \
  -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath build/Talli.xcarchive \
  -exportOptionsPlist ../scripts/ExportOptions.plist -exportPath build/upload \
  -allowProvisioningUpdates
```

`scripts/ExportOptions.plist` uploads straight to App Store Connect with the Xcode account. **Bump `expo.ios.buildNumber` in `app.json` before every upload**; App Store Connect rejects a repeated build number. The two config plugins in `apps/mobile/plugins/` are required for the iOS 27 SDK (see `docs/brain/05-apple-intelligence.md`).

## What to Test (build 1)

- Sign in, create a group, add expenses with Quick, Detailed and Itemized entry.
- **On an Apple Intelligence iPhone (iPhone 15 Pro or later, Apple Intelligence on):** scan a restaurant receipt; check the review screen highlights anything uncertain and the saved expense matches the receipt. Try Chat ("Dinner 2400 split with Ana and Ben, I paid"), Smart Split ("Ana had two drinks") and the insights summary. Repeat one scan in airplane mode.
- On an iPhone without Apple Intelligence (or with it turned off): AI features explain why they're unavailable and manual entry still works.
- Settle up, share a balance link, go offline and add an expense, then reconnect.

## Upload history

| Build | Version | Uploaded | Contents |
|---|---|---|---|
| 1 | 1.0.0 | — | First Talli build: on-device Apple Intelligence, Talli rebrand. |

## Follow-ups that don't block TestFlight

- Universal links: set the web app's `IOS_TEAM_ID=L8Y7B5Z7EQ` and `IOS_BUNDLE_IDENTIFIER=com.manoloenriquez.talli` so `/.well-known/apple-app-site-association` matches the new bundle ID.
- Add a `talli://auth/callback` redirect to the Supabase auth allowlist before moving the OAuth callback off `tabkind://`.
