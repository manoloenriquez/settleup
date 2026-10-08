# Launch readiness

Living checklist for the App Store release of Talli. Updated 2026-10-08 on `audit/talli-v1`.
**PASS** = verified with the evidence named · **FAIL** = defect or failed validation remains ·
**BLOCKED** = needs owner credentials, external configuration, a physical device or approval.
Owner steps are in `OWNER_ACTIONS.md`; findings in `PRODUCT_GAP_REGISTER.md`; the final verdict in
`RELEASE_REPORT.md`. Older history: `docs/launch-readiness.md`, `docs/audit/2026-10-product-audit.md`.

## Engineering gates

| # | Requirement | P | Status | Evidence / test | Owner | Blocker |
|---|---|---|---|---|---|---|
| E1 | Unit tests pass (shared, web, mobile, ai) | P0 | PASS | `pnpm test`: 493 (335 / 89 / 45 / 24) | Claude | — |
| E2 | Typecheck and lint, all workspaces | P0 | PASS | `pnpm typecheck`, `pnpm lint` | Claude | — |
| E3 | SQL suites (RLS, ledger, sharing, friends, push, events, five groups) | P0 | PASS | 14 suites on the local stack; CI `db-tests` green | Claude | — |
| E4 | CI green on the PR | P0 | PASS | manoloenriquez/settleup#5 | Claude | — |
| E5 | Web production build | P0 | PASS | CI `Build` step; Vercel preview built | Claude | — |
| E6 | iOS Release build (iOS 27 SDK) | P0 | PASS | Simulator Release build; device archive of build 6 | Claude | — |
| E7 | Simulator journeys (guest, currency, account import, group, payment details, friend, assistant ×2, edit split) | P0 | PASS | `tools/ui-driver` 2026-10-08, server rows checked | Claude | — |
| E8 | Upgrade from build 5 | P0 | PASS | `check-upgrade.sh` | Claude | — |

## Product requirements

| # | Requirement | P | Status | Evidence / test | Owner | Blocker |
|---|---|---|---|---|---|---|
| R1 | Financial correctness: integer minor units, splits sum exactly, per-currency balances never mixed | P0 | PASS | `split.test.ts`, `split-resolve.test.ts` (BigInt, random 300-case sums to 9e15), `currency_ledger.sql`, `group_journey.sql` | Claude | — |
| R2 | Offline expenses keep currency and date | P0 | PASS | G-01 fix `18ae3ff`; `expense-rpc-input.test.ts` | Claude | — |
| R3 | Equal / percent / shares / exact on add **and edit**, mobile and web | P1 | PASS | `split-resolve.test.ts`; edit modals use the shared resolver | Claude | — |
| R4 | Mobile can edit an expense's date; offline edit replays it | P1 | PASS | `18ae3ff`; builder test | Claude | — |
| R5 | Offline queue: idempotent, no duplicates or losses, conflicts surfaced | P0 | PASS | `offline.test.ts` (43), `outbox-executor.test.ts`, docs/brain/04 matrix | Claude | — |
| R6 | Guest mode and guest → account import without loss | P0 | PASS | Simulator `GuestJourneyTests`, `AccountJourneyTests`; `personal-sync.test.ts` | Claude | — |
| R7 | Sharing is privacy-safe; links revocable; payment details opt-in | P0 | PASS | `public_payloads.sql`, `sharing_and_payment_privacy.sql`, `launch_security.sql` | Claude | — |
| R8 | Five realistic groups (2-person, multi-member, external members, multi-currency travel, partial settlements + history) | P1 | PASS | `five_groups.sql` (hand-computed balances, edits, delete, partial settlements, three currencies) | Claude | Real-people run is owner (O8) |
| R9 | Privacy policy matches the app | P0 | PASS | G-02 rewrite | Claude | Owner publishes via O1 |
| R10 | Account deletion in app | P0 | PASS | Account → Delete Account; `account_closure.sql` | Claude | — |
| R11 | Sign in with Apple available | P1 | BLOCKED | Built; hidden behind flag | Owner | Supabase Apple provider (O5) |
| R12 | Email confirmation / recovery / Google OAuth live | P1 | BLOCKED | Code paths tested earlier on web; live delivery unverified | Owner | Inbox + dashboard (O6) |
| R13 | Universal links and friend links in production | P1 | BLOCKED | Production web is stale (G-03) | Owner | Deploy (O1) |
| R14 | Crash reporting | P1 | BLOCKED | DSN-gated code exists | Owner | Sentry DSN (O4) |
| R15 | Push notifications | P2 | BLOCKED | DB side live, `push_delivery.sql` passes | Owner | Function deploy (O3) |
| R16 | First-party analytics isolated to Talli | P2 | BLOCKED | `product_events.sql` passes locally/CI | Owner | Apply migrations (O2) |

## AI

| # | Requirement | P | Status | Evidence / test | Owner | Blocker |
|---|---|---|---|---|---|---|
| A1 | Receipt: ≥98% final-total accuracy on legible receipts | P1 | PASS (on 3 real + 30 synthetic) | 3/3 and 30/30; `pnpm eval:receipts`, `--dir synthetic` | Claude | Larger real PH set (owner photos) |
| A2 | Receipt: zero unflagged wrong totals; zero fabricated money | P0 | PASS | 0 unflagged on both sets | Claude | — |
| A3 | Receipt and Assistant work in airplane mode | P1 | PASS (Mac/simulator) · BLOCKED (device) | No network APIs in the pipeline; Mac runs offline | Owner | Device check (O8) |
| A4 | Assistant: zero unauthorized operations in the security suite | P0 | PASS | `cases.json` security 6/6 and holdout 3/3, every interpreter; resolver only acts on ids from the user's own snapshot | Claude | — |
| A5 | Assistant: every write needs Confirm; result reflects the real service response | P0 | PASS | `useAssistant` / `executor.ts`; journeys `AssistantGuestJourneyTests`, `AssistantSignedInJourneyTests` | Claude | — |
| A6 | Assistant: incorrect write previews ≈ 0 on the held-out set | P1 | FAIL (mitigated) | 2/39 (5.1 %) on holdout2, 1/38 on holdout; each visible on the preview and requires Confirm | Claude | More phrasing coverage (post-launch) |
| A8 | Receipt line-item price ≥ 95 % | P1 | PASS (synthetic 96.7 %) · real 94.7 % (1 OCR misread, flagged) | AI_BENCHMARK_RESULTS | Claude | — |
| A7 | Assistant works without Apple Intelligence (rules) and offline | P1 | PASS | rules interpreter benchmark; offline writes go through the outbox | Claude | — |

## Release

| # | Requirement | P | Status | Evidence | Owner | Blocker |
|---|---|---|---|---|---|---|
| S1 | Physical-device validation of build 6 | P0 | BLOCKED | Checklist O8 | Owner | Device |
| S2 | TestFlight upload of the release candidate | P0 | PASS | Build 6 uploaded 2026-10-08 ("Upload succeeded"); archive verified | Claude | Processing + tester assignment (owner) |
| S3 | App Store listing name, privacy answers, review notes | P1 | BLOCKED | O7 | Owner | App Store Connect |
| S4 | Submission for review | P0 | BLOCKED | Not before GO | Owner | Approval |
