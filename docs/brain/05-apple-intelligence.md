# 05 — On-device intelligence (Apple Intelligence, iOS 27)

All language-model features of the iPhone app run on the device with Apple's
FoundationModels framework and Vision. There is no cloud AI provider anywhere
in the repository, no per-request AI cost, and no fallback that uploads
receipts or expense text. When Apple Intelligence is unavailable the features
say why and the manual flows remain.

## What runs where

| Feature | iPhone (iOS 27 + Apple Intelligence) | Web / Android / ineligible iPhone |
|---|---|---|
| Receipt scan | Vision OCR → FoundationModels guided generation → deterministic reconciliation → review | Web: Tesseract + regex (`packages/ai`); Android: manual entry |
| Chat expense entry | FoundationModels interprets the sentence; code resolves names, dates, cents | Keyword parser (`parseExpenseText`) |
| Smart split | FoundationModels reads the description; `equalSplit`/`percentSplit`/`sharesSplit` compute cents | Equal split |
| Insights narrative | Statistics computed in code; model writes 2–3 sentences from them | Statistics only |
| Category | Guided enum for chat; keyword classifier (`inferCategorySlug`) for receipts | Keyword classifier |

## Receipt pipeline

```
Receipt photo (camera / library)
      ↓  ImageIO decode, EXIF orientation, longest side ≤ 2048 px
Vision RecognizeDocumentsRequest (language correction off)
      ↓  deskew by median baseline slope, group boxes into rows,
         re-pair item names with a vertically offset price column
OCR rows ("Coke Zero  125.00  125.00", …)
      ↓  LanguageModelSession.respond(generating: ReceiptExtraction.self,
         options: .greedy)  — @Generable/@Guide schema, ~1.4–1.7k input tokens
Raw extraction (merchant, date, currency, charges, items) + OCR rows
      ↓  JSON over the Expo bridge, Zod-validated
reconcileReceiptExtraction()  (packages/shared, vitest-tested)
      ↓  every amount snapped to a printed OCR amount; quantity from "2 @"/two-amount
         rows; subtotal from items; inclusive-VAT vs additive-tax hypotheses;
         faded/invented charges derived from the printed total; decoy totals;
         100× shifts; per-field state verified / likely / needs_review / missing
ReceiptReview → ParsedReceipt → seedReceiptItems() (charges line, discount spread)
      ↓
Review screen (ReceiptItemEditor) → group → split → confirm → existing RPCs
```

The model is asked to *label* the printed rows, not to compute. The 3B system
model is reliable at "which row is the total" and unreliable at arithmetic and
quantities; the reconciliation owns every number. No numeric confidence is
shown to users — field states come from OCR agreement and arithmetic.

## Code map

```
apps/mobile/modules/apple-intelligence/      local Expo module (Swift, iOS 27)
  ios/Core/ReceiptOCR.swift                  Vision OCR + row reconstruction
  ios/Core/ReceiptExtraction.swift           @Generable schema + prompts
  ios/Core/ReceiptAnalyzer.swift             photo → raw extraction
  ios/Core/ExpenseIntelligence.swift         chat, split and insights schemas/runners
  ios/Core/ModelAvailability.swift           SystemLanguageModel.availability → status
  ios/Core/IntelligenceError.swift           typed error codes
  ios/AppleIntelligenceModule.swift          Expo bridge (JSON in/out, {ok,…} envelopes)
apps/mobile/src/lib/ai/
  apple-intelligence.ts                      typed bridge, Zod schemas, user-facing copy
  interpretation.ts                          pure mappers (draft, split cents, insight facts)
  receipt.ts / conversation.ts / smart-split.ts / insights.ts
packages/shared/src/utils/
  receipt-reconcile.ts                       deterministic reconciliation + review states
  category.ts                                keyword classifier
  date-mention.ts                            "yesterday", "last Friday" → ISO date
tools/receipt-eval/                          macOS eval harness (see below)
```

## Availability

`SystemLanguageModel.default.availability` is read on every call, never cached:

| Native status | App behaviour |
|---|---|
| `available` | features enabled |
| `deviceNotEligible` | "This iPhone can't run Apple Intelligence…" — manual flows only |
| `appleIntelligenceNotEnabled` | points to Settings › Apple Intelligence & Siri |
| `modelNotReady` | "still downloading its model, try again" |
| `unsupported` (Android, iOS < 27, module not linked) | manual flows only |

Failures during generation map to `contextExceeded`, `declined`, `busy`,
`unsupportedLanguage`, `unreadableImage`, `failed`; each has copy in
`describeError`. Nothing falls back to a server.

## Offline

Inference needs no network. Receipt scanning, chat entry, smart split and
insights narratives work in airplane mode once the model assets are on the
device. Supabase sync still needs connectivity; the two are independent
(`useAiAvailability` vs the offline banner).

## Building with Xcode 27

`ios/` is untracked prebuild output; regenerate it with `npx expo prebuild
--platform ios --clean` (CocoaPods needs `LANG=en_US.UTF-8` in non-interactive
shells). Two local config plugins in `apps/mobile/plugins/` make Expo 54 /
React Native 0.81 build and launch against the iOS 27 SDK:

- `with-pod-deployment-target.js` raises pod targets below iOS 15 (Xcode 27
  rejects them) and adds hermes-engine's `destroot/include` to
  ExpoModulesCore's header search paths (the prebuilt pods otherwise fail with
  `hermes/hermes.h not found`).
- `with-ios-scene-lifecycle.js` declares a scene manifest and a `SceneDelegate`
  that attaches the React Native window to the connecting scene; the iOS 27
  SDK refuses to launch apps without the UIScene life cycle. Drop it when the
  app moves to an Expo SDK with built-in scene support.

Set `SENTRY_DISABLE_AUTO_UPLOAD=true` for local builds without a Sentry org.
`expo run:ios` could not locate Simulator.app from a non-interactive shell; a
plain `xcodebuild -workspace ios/Talli.xcworkspace -scheme Talli
-configuration Release -sdk iphonesimulator -destination 'platform=iOS
Simulator,id=<iOS 27 udid>' build` followed by `xcrun simctl install/launch`
works. Release embeds the JS bundle, so no Metro is needed to smoke-test.

## Devices

Apple Intelligence requires an A17 Pro or later iPhone (iPhone 15 Pro/Pro Max,
every iPhone 16 and 17 model) running iOS 27 with Apple Intelligence turned on.
The app's minimum deployment target is iOS 27 (`expo-build-properties`).

## Evaluation suite

`pnpm eval:receipts` builds `tools/receipt-eval` (SwiftPM, macOS 27; the
module's `ios/Core` is symlinked in), runs the exact on-device pipeline over
`sample-inputs/receipts/*.jpg` on the Mac's copy of the system model, then
scores the reconciled result against `sample-inputs/receipts/expected/*.json`
with the same TypeScript reconciliation the app ships. It reports total,
merchant, date, subtotal, tax, service charge, discount, item price/name/
quantity accuracy, required-field completion, review states and latency.

Run it after every iOS/macOS release: the system model changes with the OS,
so prompts and row reconstruction are behaviour that needs regression checks.
The first OCR call in a process includes Vision model load (~1 min on an M1
Pro); later calls take well under a second. `--save raw.json` keeps the raw
model output; `eval:raw raw.json` rescores it after reconciliation changes
without touching the model.

Latest runs (2026-10-01):

| Runtime | total | merchant | date | subtotal | svc | disc | item price | item name | model latency |
|---|---|---|---|---|---|---|---|---|---|
| macOS 27.0 host (M1 Pro) | 3/3 | 2/3 | 3/3 | 2/3 | 2/3 | 3/3 | 18/19 | 16/19 | 6–16 s |
| iOS 27.0 simulator (iPhone 18 Pro, same Mac) | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 18/19 | 15/19 | 9–20 s |
| OpenAI gpt-5.4-mini (replaced) | 3/3 | 3/3 | 3/3 | 3/3 | – | – | 17/19 | 17/19 | 6–11 s |

The one item price still wrong on both runtimes is an OCR misread on the
angled photo (`Pancake 2pcs 280.00` read as `200.00`); the reconciliation flags
the receipt as needs-review because the items no longer add up to the printed
total. To run the same core inside a simulator without the app:
`xcrun swiftc -target arm64-apple-ios27.0-simulator -sdk $(xcrun --sdk iphonesimulator --show-sdk-path) -parse-as-library apps/mobile/modules/apple-intelligence/ios/Core/*.swift tools/receipt-eval/Sources/receipt-eval/main.swift -o receipt-eval-sim`
then `xcrun simctl spawn <iOS 27 udid> ./receipt-eval-sim sample-inputs/receipts IMG_8255.jpg …`
and score with `pnpm --filter @template/receipt-eval eval:raw <saved json>`.
