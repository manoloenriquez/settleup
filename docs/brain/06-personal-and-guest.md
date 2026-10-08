# 06 — Personal expenses, guest mode and account import

Talli is useful before sign-up. Anyone can track their own spending on the
phone; an account adds sharing, backup and other devices.

## Who can do what

| Capability | Guest | Signed in |
|---|---|---|
| Onboarding, main currency | ✓ | ✓ |
| Personal expenses (add, edit, delete + undo, history, search, monthly summary) | ✓ on device | ✓ on device + synced |
| Receipt scan, "Describe it" (Apple Intelligence where available) | ✓ | ✓ |
| Any currency per expense (never converted, never summed across currencies) | ✓ | ✓ |
| Groups, members without accounts, balances, settle up, share links, payment details | explanation + Create account / Sign in / Not now | ✓ |

Guests are never given an anonymous cloud account. Screens that need an
identity are gated in two places: `RouteGuard` (`app/_layout.tsx`, using
`isGuestAllowed` in `src/lib/routes.ts`) redirects guests away from account-only
routes to the Shared tab, and the Shared/Account tabs render a guest variant.

## Data model

- **Device preferences** (`talli:prefs:v1`): onboarding completion and main
  currency. They belong to the person holding the phone, not an account.
- **Personal ledger** (`packages/shared` schemas/types/utils `personal*`): each
  record has a client UUID, integer minor units, an ISO 4217 code from the
  supported set, a category slug, a local date, a tombstone (`deletedAt`) and
  a sync state (`local` guest / `pending` / `synced`) plus the last server
  version it was acknowledged at.
- **Stores** (`apps/mobile/src/lib/personal/storage.ts`): one AsyncStorage key
  for the guest (`talli:personal:v1:guest`) and one per account and project.
  `PersonalLedgerContext` remounts per owner, serializes writes and persists
  each change before showing it. A store that fails validation is kept, never
  overwritten.
- **Server** (`settleup.personal_expenses`, migration `20261001100000`): owner
  SELECT via RLS, no direct writes; `upsert_personal_expenses(jsonb)` (definer,
  checks `auth.uid()` and account closure) writes batches of up to 100.
  Closing an account deletes the rows (trigger on `closed_accounts`).

Personal expenses are deliberately not one-member groups: they would leak into
group lists, dashboards, balances and share links and need special cases
everywhere, and they never need splits.

## Sync

`PersonalLedgerContext` runs the loop for signed-in users: after load, after
each write (1.5 s debounce), on reconnect and on foreground; exponential
backoff to 5 min on failure.

1. Push pending records in batches of 50 (`toPushRow`), apply results with
   `applyPushResults`: a record edited while the request was in flight stays
   pending with the new base.
2. Pull rows changed since the pull cursor (the newest version a previous pull
   returned; upload acknowledgements never move it) with a
   2-minute overlap for late commits) and `mergePulledRows`; unsent local edits
   are never overwritten.

Conflict rule (server-side): the last write to **arrive** wins — device clocks
are never compared. A deleted row is restored only by a device whose base
version is the deletion itself (Undo on the device that deleted it); every
other device adopts the deletion (`kept_server`).

## Guest → account

- On sign-in, `GuestImportPrompt` asks once per session: "Add N expenses to
  your account?" — **Add to My Account** or **Not Now**. The Account tab keeps
  offering the import.
- Import copies live guest records into the account store as pending with the
  **same ids**, so repeating it after a crash or retry never duplicates, and
  the server upsert is idempotent by id.
- The guest store is removed only when every live guest record exists in the
  account store **and** is `synced` (`guestImportComplete`). Until then it stays
  on the device; if the person signs out it is theirs again as a guest.

## Sign-out and shared devices

- Sign-out warns when outbox entries or personal records have not synced.
- A few seconds after any auth change, `purgeInactiveAccountData` removes other
  accounts' query caches, empty outboxes and fully synced personal stores.
  Anything unsynced or unreadable stays until its owner signs in again.

## Tests

- `packages/shared/src/__tests__/personal-ledger.test.ts`, `personal-sync.test.ts`,
  `amount.test.ts`
- `apps/mobile/src/lib/__tests__/account-data.test.ts`, `personal-drafts.test.ts`
- `supabase/tests/personal_expenses.sql` (ownership, replay, deletion rule,
  undo, validation, anon, closure)
- `tools/ui-driver` (XCUITest): the guest journey on the iOS 27 simulator —
  `tools/ui-driver/run.sh <udid> <path/to/Talli.app>`
