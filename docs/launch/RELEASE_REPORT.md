# Release report — Talli 1.0 (build 6)

Date 2026-10-08 · Branch `audit/talli-v1` · PR manoloenriquez/settleup#5 (draft, CI green) ·
Release candidate: build 6 (1.0.0), **uploaded to App Store Connect on 2026-10-08**.

## Recommendation: **CONDITIONAL GO**

Every engineering item that could be done and verified on this machine is complete. No known P0 or
launch-critical P1 defect remains open in the code. **Release is blocked only by owner actions**
(`OWNER_ACTIONS.md`):

1. **Deploy the web app (O1).** Friend links and universal links are broken in production today.
2. **Enable the Sign in with Apple provider (O5).** App Review requires it, because Google sign-in is
   offered.
3. **Validate on a physical iPhone (O8).** This includes Apple Intelligence on a real device, the
   upgrade from build 5, airplane mode and push.
4. **Set up App Store Connect (O7):** name, privacy answers, review notes; add build 6 to testers once
   it has processed.

Push (O3), analytics migrations (O2) and Sentry (O4) should also be done before public release; none
of them blocks TestFlight.

This is **not** a GO: the physical-device checks have not been run, and Sign in with Apple is still
off, which would fail App Review.

## What changed in this pass

| Area | Change | Evidence |
|---|---|---|
| **P0 offline currency** | Offline expense creates and edits on mobile stored non-PHP amounts as pesos. The currency is now required by every RPC builder type. | `18ae3ff`; `expense-rpc-input.test.ts` |
| Edit on mobile | Date editing; Equal / % / Shares / Exact through one shared resolver; the sheet now stays above the keyboard | `18ae3ff`, `fc4d83d`; `split-resolve.test.ts` (18); `EditSplitJourneyTests` with server rows checked |
| Edit on web | % / Shares / Exact; notes editable | `18ae3ff` |
| Money arithmetic | Largest-remainder split in BigInt | `split.test.ts`, 300-case random sums up to 9e15 |
| **Talli Assistant** | New tab: add, edit and delete expenses, record payments, manage groups, answer balance and spending questions, read receipts; on-device, confirm-before-write, offline-aware | `364b6d1`; 31 resolver tests; `AssistantGuest/SignedInJourneyTests`; benchmark below |
| Receipts | Printed quantities parsed deterministically; synthetic 30-receipt benchmark | `ba3aea2` |
| Repository | The on-device AI native module was never committed (ignored by `.gitignore`). Now tracked. | `dd17889` |
| Privacy | The privacy policy was wrong about deletion and share links and omitted several data uses. Rewritten. | `c4731f5` |
| Performance | The background Assistant tab kept the app from ever going idle while typing (found and bisected with the journeys) | `3ea38af` |
| CI | Node 22 (jsdom 30); the first `db-tests` run passed | `d4f8fb1` |
| Five groups | Two-person, multi-member with % and shares and a delete, external members, PHP/USD/JPY travel, history with partial settlements, all checked against hand arithmetic | `supabase/tests/five_groups.sql` |

## Tests executed (all on 2026-10-08)

| Suite | Result |
|---|---|
| Unit (Vitest) | **493 passed**: shared 335, mobile 89, web 45, ai 24 |
| Typecheck / lint | All workspaces clean |
| SQL against the local stack with every migration applied | **14/14 suites pass** (RLS, ledger, sharing and privacy, public payloads, friends, push, product events, account closure, personal expenses, recurring permissions, QR storage, currency, five groups) |
| CI (GitHub Actions) | Lint, typecheck, test, build, and `db-tests` all green |
| Web production build | Passes (existing Sentry/OpenTelemetry warnings) |
| iOS Release build (iOS 27 SDK, simulator) | Builds; archive for device below |
| Simulator journeys (iOS 27, local Supabase) | **All pass:** Guest, Currency, Account (guest → new account import), Group, Payment details, Friend, Assistant guest, Assistant signed in (server rows checked: one ₱900 expense split 300×3, one ₱300 payment, a cancelled preview saved nothing), Edit split (date 2026-10-01, shares 45000/27000/18000) |
| Upgrade build 5 → build 6 | **PASS** (`check-upgrade.sh`) |
| Auth on the local stack | The recovery email is delivered (Mailpit). Redirect allowlist corrected locally; production needs O6. |

## Verified product flows

Guest use and personal expenses; guest → account import; group creation with people who have no
account; add, edit and delete with every split type; multi-currency balances never mixed; payments
and partial settlements; friend invites; sharing privacy (SQL); offline queue semantics (unit) and
offline currency (fixed); and the Assistant end to end in both guest and signed-in modes.

## AI accuracy and performance (details: `docs/ai/AI_BENCHMARK_RESULTS.md`)

| | Result | Target | |
|---|---|---|---|
| Receipt final total | 3/3 real, 30/30 synthetic | ≥ 98 % | met on these sets |
| Wrong total not flagged | 0 / 0 | 0 | met |
| Receipt line-item price | 94.7 % real (18/19), 96.7 % synthetic | ≥ 95 % | met on synthetic; 1 OCR misread on the angled real photo, flagged |
| Receipt latency | 8–20 s typical; ~100 s for 30-line receipts | — | known limitation (G-28) |
| Assistant: unauthorized operations | 0 (12/12 security turns, every interpreter) | 0 | met |
| Assistant: task success, clean held-out set | 69.2 % (hybrid) | — | common phrasings work; unusual ones get a question or a refusal |
| Assistant: incorrect write previews, held-out | 2.6–5.1 % (all visible on the card, all need Confirm) | ≈ 0 | **not met**, mitigated by Confirm |
| Assistant latency | Instant for 75–90 % of turns; 6–8 s median when the model runs | — | |

The receipt dataset is small (3 real photos plus synthetic renders). Collecting about 30 real
Philippine receipts is the main open data task (G-12).

## Remaining blockers and limitations

**Blockers (owner):** O1 web deploy · O5 Sign in with Apple provider · O8 physical-device checklist on
build 6 · O7 App Store Connect. Recommended before the public release: O2 analytics
migrations, O3 push, O4 Sentry, O6 auth URLs and email delivery.

**Known limitations (accepted for launch, in the gap register):**
- The Assistant is iPhone-only (G-20).
- The Assistant cannot edit an expense that is still queued offline (G-19).
- Model latency on long receipts (G-28) and for unrecognised Assistant phrasings (G-21).
- Filipino coverage in the Assistant is thin (1/3 on the clean set).
- Incorrect Assistant previews at a few percent need the user to read the card.

**Suggested product decision:** label the Assistant "Beta" in the UI for 1.0, since its held-out
success is 69 %. Safety is enforced in code either way.

## Release candidate

Build 6 (version 1.0.0) was archived from commit `fc4d83d` plus documentation-only commits, using the
live configuration. Checks on the archive: `CFBundleVersion` 6; bundle id `com.manoloenriquez.talli`;
team L8Y7B5Z7EQ; no `127.0.0.1` in `main.jsbundle`; the live Supabase project reference present;
Assistant included. It was uploaded with `xcodebuild -exportArchive` ("Upload succeeded"). The build
does not enable Sign in with Apple (the provider is not configured) or Sentry (no DSN). Both need a
later build once O4 and O5 are done.
