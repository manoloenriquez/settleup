# SettleUp Product Requirements Document

**Document status:** Draft for product review  
**Product stage:** Private beta to public beta  
**Last updated:** 1 September 2026  
**Working product name:** SettleUp (launch name requires clearance; see Open Decisions)  
**Primary market:** Philippines  
**Platforms:** Responsive web/PWA, iOS, and Android

---

## 1. Executive Summary

SettleUp is a group expense and settlement app designed around how friends,
households, and travel groups in the Philippines actually share costs. An
organizer can record expenses, calculate accurate balances, and share a
personal link with each participant. Participants do not need an account to
see what they owe, view GCash or bank payment instructions, and report that
they have paid.

The product removes two recurring sources of friction:

1. **Capturing shared spending is tedious.** SettleUp supports quick entry,
   detailed and itemized expenses, receipt scanning, and natural-language
   drafts.
2. **Collecting repayment is socially awkward.** Personal links, clear debt
   summaries, local payment details, and confirmation-based settlements make
   the next step explicit without requiring every participant to install an
   app.

The public-beta goal is to prove that a Philippine-first, GCash-oriented group
ledger can help an organizer move a real group from its first expense to a
settled balance faster and with less coordination than a generic expense
splitter.

---

## 2. Product Context

### 2.1 Current state

The application already implements a substantial beta product across web and
mobile:

- Group creation, roles, membership, invitations, archiving, and ownership
  transfer
- Equal, exact, itemized, multi-payer, recurring, receipt-scan, and chat-based
  expense entry
- Expense dates, categories, comments, group budgets, activity, and insights
- Pairwise balances and simplified debt transfers using integer-cent math
- Per-user GCash and bank payment profiles, including QR images
- Per-group and per-member public links that do not require authentication
- Participant-submitted payments with creditor confirmation or rejection
- Realtime updates, offline read caches, and queued offline writes on web and
  mobile
- CSV export, push notification infrastructure, error monitoring, and an
  administrative surface

The repository's original MVP brief is now historical. This PRD defines the
product that should be validated and launched from the current foundation.

### 2.2 Product thesis

The product will win first by being the easiest way for one person in a
Filipino group to keep the ledger and collect through the payment methods the
group already uses. Universal adoption by every participant is not required.

### 2.3 Working assumptions

Unless changed through product review, this PRD assumes:

- The initial launch is Philippine-market-first and PHP-only.
- Organizers and active collaborators have accounts; passive participants can
  use secure public links without an account.
- The public beta is free. Pricing and entitlements are not part of this
  release.
- Money moves outside SettleUp. The app records and confirms payments but does
  not custody funds or claim that a bank or wallet transfer succeeded.
- AI produces editable drafts only. A user always reviews and confirms before
  any expense is stored.
- Core organizer flows should be available on both web and mobile. Public
  participant links may remain web-first if they open cleanly on mobile.

---

## 3. Problem Statement

Group expenses are easy to incur and hard to reconcile. One organizer often
ends up reconstructing receipts, calculating shares, messaging each person,
re-sending payment details, and manually tracking who has paid. Existing tools
add friction when they require all participants to register, are not oriented
around Philippine payment methods, or make expense capture slower than a chat
message or receipt photo.

### 3.1 User pain

- Organizers spend time doing arithmetic and maintaining a ledger in chat or a
  spreadsheet.
- Participants cannot easily verify why they owe a particular amount.
- Payment details and reminders are repeatedly copied across conversations.
- Groups disagree when rounding, edits, partial payments, or concurrent updates
  are not handled reliably.
- Expense entry happens in places with poor connectivity and must survive an
  app restart or reconnection.
- Requiring every participant to install an app causes the workflow to fail
  before the group receives value.

### 3.2 Opportunity

SettleUp can own the space between expense tracking and local settlement:
maintain a trustworthy group ledger, minimize participant onboarding, and make
GCash or bank repayment the obvious next action.

---

## 4. Target Users

### 4.1 Primary persona: The Organizer

The person who volunteers, or is expected, to keep track of shared spending.
Common examples include the trip planner, household treasurer, team organizer,
or person who paid the largest bill.

**Needs:** fast entry, correct calculations, flexible splits, a complete view
of balances, easy sharing, and a low-friction way to follow up.

**Success looks like:** the group is fully recorded and settled without the
organizer maintaining a second ledger.

### 4.2 Secondary persona: The Participant

A friend, relative, roommate, or colleague included in a group. They may not
want another account or app.

**Needs:** a clear explanation of what they owe, trusted payment details, an
easy way to copy or scan them, and a way to report payment.

**Success looks like:** they understand the balance and complete their part in
under a minute.

### 4.3 Secondary persona: The Collaborator

A signed-in member who helps administer a group or add expenses.

**Needs:** appropriate permissions, reliable concurrent updates, an activity
record, and confidence that offline edits will not silently overwrite newer
data.

**Success looks like:** multiple people can maintain one ledger without
duplication, data leakage, or unexpected balance changes.

### 4.4 Internal persona: The Operator

The person responsible for beta access, support, safety, reliability, and cost
control.

**Needs:** health and error visibility, abuse controls, user/account tools, and
clear launch gates.

---

## 5. Jobs to Be Done

- When my group starts spending together, help me create a shared ledger and
  include everyone without making them register first.
- When someone pays for something, help me record who paid and who benefited
  with the least possible typing.
- When a receipt has many items, help us assign the right costs without doing
  manual arithmetic.
- When I need to know where the group stands, show accurate balances and the
  smallest practical set of transfers.
- When it is time to collect, give each participant one clear page containing
  their balance and the correct payment details.
- When someone says they paid, let the recipient verify it before the ledger
  changes.
- When connectivity fails, preserve the user's work and reconcile it safely
  later.

---

## 6. Product Principles

1. **The ledger must be trustworthy.** Accuracy, permissions, and conflict
   handling take priority over convenience or novelty.
2. **One organizer can create value for everyone.** Account-less participation
   is a core capability, not a marketing add-on.
3. **Fast by default, detailed when needed.** Quick equal splitting should take
   seconds, while multi-payer, exact, and itemized flows remain available.
4. **Philippine payment context is first-class.** PHP display, GCash, bank
   transfer details, and mobile sharing should feel native to the primary
   market.
5. **AI assists; people decide.** Generated output is validated, presented as a
   draft, and never writes autonomously.
6. **Offline work is real work.** Pending changes must be visible, durable, and
   idempotent when replayed.
7. **Public links reveal the minimum useful data.** Token holders see only what
   is required to understand and settle the relevant balance.

---

## 7. Goals and Non-Goals

### 7.1 Public-beta goals

- Validate that organizers can reach first value—group, members, and first
  expense—without assisted onboarding.
- Validate that account-less links are opened and used by real participants.
- Demonstrate zero known balance-calculation discrepancies in production.
- Make the complete core workflow reliable on web, iOS, and Android.
- Validate demand for AI-assisted capture without compromising ledger
  correctness or creating uncontrolled cost.
- Establish the measurement, support, and security foundation required for a
  wider release.

### 7.2 Non-goals for public beta

- Holding funds or executing GCash, bank, card, or wallet transfers
- Multi-currency accounting or foreign-exchange conversion
- A cross-group social graph or consolidated one-to-one friends ledger
- Full bookkeeping, reimbursement, payroll, tax, or corporate expense features
- Automatic debt collection or reminders sent without user consent
- AI-created expenses that bypass user confirmation
- Ads, paid plans, or usage caps
- Desktop-native applications

---

## 8. Core User Journeys

### 8.1 Organizer activation

1. The organizer registers or signs in.
2. They create a group and are added as its owner/member.
3. They add at least two participants or share an invite.
4. They add the first expense using quick, detailed, itemized, receipt, or chat
   entry.
5. They see updated balances and copy a group or personal share link.

**Desired outcome:** first expense recorded and first link shared within five
minutes of account creation.

### 8.2 Participant repayment without an account

1. The participant opens their personal link.
2. They see the group, their amount owed, relevant expense detail, and the
   recipient's payment profile.
3. They copy payment details or use the visible QR code to pay externally.
4. They submit “I've paid” with the amount.
5. The creditor confirms or rejects the pending payment.

**Desired outcome:** the participant can understand and act without installing
the app or seeing another member's private data.

### 8.3 Receipt-assisted itemization

1. The organizer photographs or selects a receipt.
2. The system extracts merchant, total, and line items through the configured
   on-device or server-assisted path.
3. The organizer corrects the draft, assigns participants, chooses payers and a
   category, and confirms.
4. The system validates that line items, payer amounts, and participant shares
   reconcile before saving atomically.

**Desired outcome:** receipt capture saves time but can never silently create an
unbalanced ledger entry.

### 8.4 Offline expense entry

1. A previously authenticated user opens a cached group while offline.
2. They create or edit a supported expense or record a payment.
3. The app shows a durable pending state and preserves it across restart.
4. On reconnection, the action replays exactly once through the same
   authorization rules as an online action.
5. A conflict is surfaced for explicit retry or discard rather than silently
   overwriting another user's change.

**Desired outcome:** no supported offline action is lost or duplicated.

---

## 9. Functional Requirements

Status labels below describe the repository as reviewed for this draft:

- **Current:** implemented in the present codebase
- **Partial:** present but requires launch hardening or UX completion
- **Gap:** required for public beta but not currently complete
- **Later:** intentionally outside the public-beta scope

### 9.1 Accounts and onboarding

| ID      | Priority | Requirement                                                                                                                                               | Status                        |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| AUTH-01 | P0       | Users can register, sign in, recover access, sign out, edit their profile, and delete their own account.                                                  | Current                       |
| AUTH-02 | P0       | Protected web and mobile routes reject unauthenticated access without leaking group data.                                                                 | Current                       |
| AUTH-03 | P0       | A new organizer is guided to create a group, add participants, add payment details, and record the first expense.                                         | Partial                       |
| AUTH-04 | P1       | Authentication should reach first product value without an unnecessary inbox dead end.                                                                    | Gap                           |
| AUTH-05 | P0       | Account deletion removes or anonymizes dependent data according to the published privacy policy and is available only to the authenticated account owner. | Current; verify before launch |

### 9.2 Groups, members, and collaboration

| ID     | Priority | Requirement                                                                                                                      | Status                                  |
| ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| GRP-01 | P0       | A signed-in user can create, rename, archive, restore, leave, or delete a group subject to their role.                           | Current                                 |
| GRP-02 | P0       | Group owners can add display-name-only participants without requiring accounts.                                                  | Current                                 |
| GRP-03 | P0       | Owners can promote administrators and transfer ownership; unauthorized members cannot escalate privileges.                       | Current                                 |
| GRP-04 | P0       | Invite and claim flows allow a participant to join or associate an account with the correct member record.                       | Current                                 |
| GRP-05 | P0       | Group/member tokens are cryptographically unguessable, unique, rotatable where exposed, and revocable by rotation.               | Current; verify entropy and rotation UX |
| GRP-06 | P1       | Native deep/universal links route supported group, member, and join links into the installed app while retaining a web fallback. | Gap                                     |
| GRP-07 | P1       | The organizer can share through the platform share sheet, not only copy text to the clipboard.                                   | Partial                                 |

### 9.3 Expense capture and management

| ID     | Priority | Requirement                                                                                                              | Status                         |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| EXP-01 | P0       | A user can record a dated expense with description, amount, payer or payers, participants, category, and optional notes. | Current                        |
| EXP-02 | P0       | Money is stored as integer minor units; payer totals and participant totals must equal the expense total.                | Current                        |
| EXP-03 | P0       | Equal splits distribute remainders deterministically so no cent is lost.                                                 | Current                        |
| EXP-04 | P0       | Exact and itemized splits support non-equal allocation with server-side invariant checks.                                | Current                        |
| EXP-05 | P1       | Percentage and share-weight split modes convert deterministically to exact cents before saving.                          | Gap                            |
| EXP-06 | P0       | Authorized users can edit or delete expenses; concurrent edits use conflict detection.                                   | Current                        |
| EXP-07 | P0       | Batch/itemized receipt confirmation is atomic: either every intended expense is stored or none is.                       | Current; integration-test gate |
| EXP-08 | P1       | Users can create weekly or monthly recurring expenses and understand the next occurrence.                                | Partial                        |
| EXP-09 | P1       | Groups with long histories load expenses through pagination without loading the entire ledger.                           | Current                        |
| EXP-10 | P1       | Users can comment on expenses and see relevant activity updates.                                                         | Current                        |

### 9.4 AI-assisted entry

| ID    | Priority | Requirement                                                                                                        | Status                         |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| AI-01 | P0       | Receipt, chat, smart-split, and insight output is schema-validated before display.                                 | Current                        |
| AI-02 | P0       | AI never writes directly to the database; the user reviews an editable draft and explicitly confirms it.           | Current                        |
| AI-03 | P0       | AI-derived payer, participant, item, and total values satisfy the same business invariants as manual input.        | Current; integration-test gate |
| AI-04 | P0       | AI failure degrades gracefully to deterministic or manual entry without blocking the core product.                 | Current                        |
| AI-05 | P0       | Server-assisted AI has per-user abuse controls and a measurable cost/error budget suitable for beta.               | Partial                        |
| AI-06 | P0       | Production configuration enables only the AI paths approved for the beta; the UI accurately reflects availability. | Gap/operational decision       |
| AI-07 | P1       | On-device receipt processing is opt-in, accurately described, and falls back safely when unavailable.              | Current                        |

### 9.5 Balances and settlement

| ID     | Priority | Requirement                                                                                                                                   | Status                          |
| ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| BAL-01 | P0       | A member's net balance accounts for payer contributions, expense shares, sent payments, and received payments.                                | Current                         |
| BAL-02 | P0       | Users can view both original pairwise obligations and a clearly labeled simplified-transfer view.                                             | Current; labeling review needed |
| BAL-03 | P0       | A signed-in user can record full or partial payments and undo only an eligible latest payment.                                                | Current                         |
| BAL-04 | P0       | An account-less participant can submit a payment claim; the intended creditor can confirm or reject it. Pending claims do not alter balances. | Current                         |
| BAL-05 | P0       | Payment details shown for a transfer belong to the intended creditor, including multi-payer groups.                                           | Current; integration-test gate  |
| BAL-06 | P1       | Partial-payment UX explains the remaining balance after confirmation.                                                                         | Partial                         |
| BAL-07 | P1       | The app can generate a clear, copyable group summary and a personalized repayment message.                                                    | Current                         |
| BAL-08 | P1       | Debt-age reminders are opt-in, route to the relevant group, and avoid notifying already-settled participants.                                 | Gap                             |

### 9.6 Public participant views

| ID     | Priority | Requirement                                                                                                                                        | Status                                     |
| ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| PUB-01 | P0       | A valid member token returns only that participant's group context, balance, relevant expense detail, and payment instructions.                    | Current                                    |
| PUB-02 | P0       | A valid group token exposes only the explicitly approved group overview fields.                                                                    | Current                                    |
| PUB-03 | P0       | Invalid or rotated tokens fail without confirming whether a private group or person exists.                                                        | Current; security-test gate                |
| PUB-04 | P0       | Public endpoints are rate-limited and safe for anonymous access.                                                                                   | Current; production-scale hardening needed |
| PUB-05 | P0       | Public pages are mobile-first, fast, accessible, and do not require app installation.                                                              | Current; QA gate                           |
| PUB-06 | P0       | QR images are intentionally visible to link holders because they are a settlement mechanism; surrounding account data remains minimized or masked. | Current; accepted design decision          |

### 9.7 Offline, sync, and realtime

| ID     | Priority | Requirement                                                                                                            | Status  |
| ------ | -------- | ---------------------------------------------------------------------------------------------------------------------- | ------- |
| SYN-01 | P0       | Previously loaded core views remain useful after connectivity loss and app restart within the documented cache period. | Current |
| SYN-02 | P0       | Supported offline mutations persist locally, display a pending state, and replay exactly once after reconnection.      | Current |
| SYN-03 | P0       | Conflicts, deleted records, terminal errors, and retryable errors produce distinct recovery paths.                     | Current |
| SYN-04 | P0       | Signing out clears persisted user data and queued mutations so another account cannot replay them.                     | Current |
| SYN-05 | P0       | Realtime updates refresh affected views without creating duplicate ledger entries or feedback loops.                   | Current |
| SYN-06 | P1       | The UI clearly communicates which actions still require a connection.                                                  | Partial |

### 9.8 Insights, activity, export, and operations

| ID     | Priority | Requirement                                                                                                                | Status                                 |
| ------ | -------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| OPS-01 | P1       | Users can view group and account-level activity relevant to their memberships.                                             | Current                                |
| OPS-02 | P1       | Group insights use real ledger data, respect expense dates/categories, and label AI-generated narrative.                   | Current                                |
| OPS-03 | P1       | A group owner can export the ledger in a portable CSV format.                                                              | Current                                |
| OPS-04 | P0       | Production errors are observable across web, mobile, and API surfaces without logging secrets or full financial payloads.  | Partial; launch configuration required |
| OPS-05 | P0       | Operators can investigate abuse and support account lifecycle issues without bypassing RLS for ordinary product mutations. | Partial                                |
| OPS-06 | P0       | Product events required for the success metrics are defined, consent-appropriate, and instrumented before public beta.     | Gap                                    |

---

## 10. Platform Requirements

### 10.1 Responsive web/PWA

- Support organizer workflows on current major mobile and desktop browsers.
- Provide the canonical public `/p/*` and `/g/*` experiences.
- Preserve visited core views and supported mutations offline.
- Provide install and update behavior that does not silently replace a running
  application version.
- Meet the accessibility criteria in this document without relying on hover,
  color alone, or precise pointer input.

### 10.2 iOS and Android

- Provide core parity for groups, expenses, balances, settlement, activity,
  payment profiles, insights, and account management.
- Persist auth securely and cached product data separately.
- Support offline mutation status, reconnect replay, and conflict recovery.
- Route notification taps and approved universal links to the relevant screen
  before public launch.
- Degrade gracefully where receipt processing differs by operating system or
  device capability.

### 10.3 Backend and API

- Supabase RLS remains the primary authorization layer for application data.
- Ordinary application mutations must not use a service-role credential.
- The service-role key remains confined to authenticated self-account deletion
  in the API boundary.
- Public RPCs return purpose-built, minimized payloads and are not substitutes
  for broad anonymous table access.
- Ledger creation and updates enforce balance invariants transactionally.

---

## 11. Non-Functional Requirements

### 11.1 Correctness and reliability

- There must be no known path that creates an expense whose payer, participant,
  or item totals do not reconcile.
- Idempotent mutation retries must not create duplicate expenses or payments.
- Pending payments must never affect balances before confirmation.
- A failed batch must not leave a partially created receipt or expense set.
- The public beta must include automated tests for RLS, public/private RPC
  access, balance calculations, payment state transitions, and offline replay.

### 11.2 Performance targets

Measured on representative production-like data and a mid-range mobile device:

- Public participant page: p75 Largest Contentful Paint under 2.5 seconds on a
  typical 4G connection.
- Cached core screen usable after launch: p75 under 1 second.
- Online expense save acknowledgment: p95 under 2 seconds, excluding media/AI
  processing.
- Balance refresh after a confirmed mutation: p95 under 3 seconds.
- Groups with 1,000 expenses remain usable through pagination without loading
  the full ledger into the client.

These are proposed beta targets; baselines must be captured before launch.

### 11.3 Security and privacy

- RLS is enabled and tested on every product table.
- Tokens, credentials, raw account identifiers, and full financial payloads are
  excluded from analytics and routine logs.
- Public tokens are treated as bearer secrets and can be rotated.
- Uploads validate MIME type and size and use server-controlled object paths.
- Anonymous and AI endpoints use production-appropriate rate limiting rather
  than relying solely on per-process memory at scale.
- Published privacy and terms pages accurately describe authentication,
  financial data, public links, AI processing, storage, retention, and account
  deletion.

### 11.4 Accessibility

- Core web flows target WCAG 2.2 AA.
- Forms expose labels, programmatic error associations, keyboard navigation,
  visible focus, and screen-reader announcements for asynchronous outcomes.
- Text and functional controls meet contrast requirements.
- Motion respects reduced-motion preferences.
- Mobile controls use adequate touch targets and accessible names.
- Balance status is never communicated through color alone.

### 11.5 Compatibility and resilience

- Supported offline work survives app termination and normal device restart.
- A schema/cache-shape release invalidates incompatible persisted caches safely.
- Failure of AI, notifications, analytics, or error reporting must not prevent
  manual expense tracking and settlement.

---

## 12. Success Metrics

### 12.1 North-star metric

**Weekly Successfully Settled Groups (WSSG):** the number of distinct groups
that record at least one expense and reduce an outstanding balance through a
confirmed payment during the same seven-day period.

This measures the complete outcome—capture through settlement—rather than app
opens or raw expense volume.

### 12.2 Proposed public-beta targets

| Metric                 | Definition                                                                                                 | Target                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------- |
| Organizer activation   | New organizers who create a group, add 2+ participants, and add an expense within 24 hours                 | ≥ 60%                 |
| Time to first value    | Median time from completed sign-in to first saved expense                                                  | ≤ 5 minutes           |
| Sharing adoption       | Activated groups that generate or copy at least one public link within 24 hours                            | ≥ 50%                 |
| Participant engagement | Unique valid personal links with at least one meaningful action (copy details, view QR, or submit payment) | ≥ 40% of opened links |
| Settlement completion  | Activated groups with an outstanding balance that record a confirmed payment within 7 days                 | ≥ 35%                 |
| Organizer retention    | Activated organizers who return and perform a core action in weeks 4–5                                     | ≥ 30%                 |
| AI draft acceptance    | AI drafts saved after review, with or without edits                                                        | ≥ 65%                 |
| Offline replay success | Eligible queued actions synced without manual repair                                                       | ≥ 99.5%               |
| Ledger correctness     | Confirmed production balance discrepancies caused by calculation or duplication                            | 0                     |
| Crash-free sessions    | Mobile and web sessions without an unhandled fatal error                                                   | ≥ 99.5%               |

Targets are hypotheses for beta review, not current baselines.

### 12.3 Guardrail metrics

- Public-link invalid-token and rate-limit rates
- AI requests, fallback rate, schema/invariant rejection rate, latency, and cost
  per accepted draft
- Payment claim rejection rate
- Offline conflict and terminal-failure rates
- Account deletion completion/error rate
- Support contacts per 100 activated groups
- Public-page data exposure or authorization incidents: target zero

### 12.4 Minimum product event taxonomy

Instrument only the fields required to evaluate behavior; never include group
names, member names, notes, account numbers, receipt content, or share tokens.

- `account_created`
- `group_created`
- `member_added`
- `expense_draft_started` with entry mode
- `expense_saved` with entry mode and participant-count bucket
- `expense_save_failed` with normalized error class
- `public_link_copied` with link type
- `public_link_opened` with link type and valid/invalid status
- `payment_details_actioned` with copy/QR action
- `payment_claim_submitted`
- `payment_claim_resolved` with confirmed/rejected status
- `offline_action_queued`
- `offline_action_resolved` with synced/conflict/failed status
- `ai_draft_generated` and `ai_draft_resolved` with accepted/edited/discarded
  status
- `group_settled`

Analytics identity and retention must follow the privacy policy and applicable
consent requirements.

---

## 13. Release Scope and Priorities

### 13.1 P0: required before public beta

- Resolve whether the product can launch under the SettleUp name.
- Complete production configuration for authentication, public URLs, storage,
  email redirects, mobile builds, error monitoring, and approved AI paths.
- Add product analytics for the minimum event taxonomy and establish baselines.
- Add automated RLS/RPC integration coverage for access boundaries, ledger
  invariants, public payloads, and payment transitions.
- Verify receipt/batch expense creation is atomic and AI drafts cannot bypass
  sum invariants.
- Complete notification tap routing and decide whether universal links are a
  launch gate or an explicitly accepted beta limitation.
- Complete privacy, terms, support, account deletion, rate-limit, upload, and
  token-rotation QA.
- Remove or intentionally retain the waitlist gate based on the launch model.
- Run the full web, mobile, public-link, offline, conflict, and accessibility
  release matrix.

### 13.2 P1: public-beta follow-up

- Percentage and weighted-share splits
- Opt-in debt-aging reminders and weekly summaries
- Improved partial-payment guidance
- Platform-native share sheets and complete universal-link routing
- Recurring-expense previews and calendar edge-case UX
- Search across groups, participants, and expenses
- Dark mode and accessibility remediation beyond launch blockers
- Richer real-data insights and charts

### 13.3 P2: post-validation expansion

- Multi-currency groups and foreign-exchange snapshots
- Cross-group one-to-one friends ledger
- Splitwise/CSV import with reconciliation preview
- “Claim your items” account-less receipt collaboration
- GCash or QR Ph deep-link assistance where technically and legally supported
- Trip mode, group wrap-ups, voice capture, and home-screen shortcuts
- A group-funded or one-time premium model, subject to pricing research

---

## 14. Launch Acceptance Criteria

The public beta is ready only when all P0 criteria below are met or an explicit
written exception is accepted by the product owner.

### Functional

- A new user can create a group, add participants, record each supported expense
  type, see correct balances, share a member link, and record a settlement on
  both web and mobile.
- A participant can open a personal link on a mobile browser, understand the
  balance, use payment details, and submit a payment without an account.
- The intended creditor can confirm or reject a participant payment; only a
  confirmed payment changes balances.
- Edits, deletes, recurring expenses, comments, categories, budgets, insights,
  exports, archive/restore, and account deletion pass their role-specific QA.

### Correctness and security

- Unit, integration, lint, type-check, and production build gates pass.
- RLS and RPC tests cover authenticated member, owner/admin, unrelated user,
  anonymous user, valid-token, invalid-token, and rotated-token cases.
- Payer, participant, item, batch, balance, and payment-state invariants pass
  automated tests.
- No service-role credential is present in web, mobile, or ordinary application
  mutation paths.
- Public payload inspection reveals no unapproved member, account, or group
  data.

### Offline and resilience

- Supported offline creates, edits, deletes, comments, categories, groups, and
  payment transitions survive restart and replay once.
- Concurrent edit, deleted-elsewhere, token-refresh, flaky-network, multi-tab,
  and deploy-with-persisted-cache scenarios follow the documented recovery UX.
- AI-disabled and AI-failure scenarios retain a complete manual workflow.

### Operations

- Production alerts and dashboards cover fatal errors, API availability, public
  endpoint abuse, AI error/cost signals, and release health.
- Product events required for the beta metrics are visible in a privacy-reviewed
  analytics environment.
- Support contact, privacy policy, terms, and account deletion are reachable
  from both platforms.
- At least one iOS device, one Android device, and representative mobile/desktop
  browsers complete the end-to-end release checklist.

---

## 15. Dependencies

- Supabase Auth, Postgres, RLS, Realtime, Storage, and scheduled/edge functions
- Production web hosting and public domain configuration
- EAS/iOS/Android build and distribution accounts
- Transactional email configuration and redirect allowlists
- Error monitoring for web, mobile, and API
- A privacy-appropriate product analytics system
- AI provider credentials and an approved beta cost/rate-limit policy if
  server-assisted AI is enabled
- Trademark/name review before store submission and public marketing

---

## 16. Risks and Mitigations

| Risk                                                   | Impact                                                 | Mitigation                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Product-name collision with an existing expense app    | Store, legal, search, and brand risk                   | Complete name clearance before launch; preserve centralized brand tokens for a rapid rename                    |
| A balance or sync defect breaks trust                  | Critical product failure                               | Integer-cent math, database invariants, idempotency, conflict detection, and mandatory integration tests       |
| Public links are forwarded or exposed                  | Private financial context reaches an unintended viewer | Minimized payloads, unguessable bearer tokens, rotation, generic metadata, rate limits, and clear sharing copy |
| A participant falsely reports payment                  | Incorrect settlement                                   | Treat submissions as pending until the creditor confirms; preserve activity evidence                           |
| AI produces plausible but incorrect data               | Incorrect ledger and user distrust                     | Strict schemas, business-invariant validation, editable drafts, deterministic fallbacks, and no direct writes  |
| AI use becomes too costly or slow                      | Poor unit economics or UX                              | On-device/deterministic fallbacks, quotas/rate limits, cost telemetry, and feature-level disablement           |
| In-memory rate limiting fails under horizontal scaling | Abuse and unexpected cost                              | Move public/AI limits to shared durable infrastructure before scale requires multiple instances                |
| PHP-only scope limits travel use cases                 | Constrains growth                                      | Position clearly as PH-first; validate the beachhead before investing in multi-currency accounting             |
| Reminders feel aggressive or damage relationships      | Churn and brand harm                                   | Opt-in, creditor-controlled, respectful copy, quiet hours, and easy suppression after payment                  |
| Offline reconciliation confuses users                  | Duplicate or apparently lost work                      | Visible pending states, exactly-once IDs, explicit conflicts, retry/discard controls, and telemetry            |

---

## 17. Open Product Decisions

The following choices materially change launch scope and require owner approval:

1. **Launch name:** Can SettleUp be cleared, or should the app be renamed before
   store submission and public indexing?
2. **Beta access:** Is the next release invite-only, open public beta, or a
   staged rollout that keeps a waitlist for unapproved users?
3. **Market promise:** Should launch messaging explicitly commit to a
   Philippines-only/PHP-only beachhead?
4. **Authentication:** Is email confirmation required before first value, or
   can the group draft/onboarding path begin before confirmation?
5. **AI offer:** Which AI features are enabled, what usage is free, and what
   per-user/provider cost ceiling triggers fallback or temporary disablement?
6. **Universal links:** Are native deep links required for public beta, or is a
   mobile-web participant experience an accepted short-term limitation?
7. **Reminders:** Are reminders part of launch, and if so, which channels,
   consent rules, quiet hours, and sender controls apply?
8. **Monetization:** Is the intended model one-time, group-funded, subscription,
   or free through the validation period? No billing should ship until this is
   researched and decided.
9. **Analytics and consent:** Which analytics provider and regional privacy
   configuration will be used?
10. **Beta targets:** Do the proposed activation, settlement, retention, and
    reliability thresholds represent the desired launch bar?

---

## 18. Suggested Validation Plan

### Phase 1: Instrumented private beta

- Recruit 10–20 real groups across trips, dining, roommates, and recurring
  household expenses.
- Observe organizer onboarding and first-expense entry without coaching.
- Interview both organizers and account-less participants after settlement.
- Record where users leave the app for chat, calculator, spreadsheet, or wallet
  tasks.
- Establish baseline performance, activation, link use, and settlement metrics.

### Phase 2: Reliability beta

- Expand to 50–100 groups after correctness and public-link tests are automated.
- Deliberately test poor connectivity, multi-device collaboration, large
  receipts, partial payments, and long-running groups.
- Enable approved AI features behind remotely controllable configuration and
  monitor acceptance, correction, latency, fallback, and cost.

### Phase 3: Public beta decision

- Compare results with the success targets and guardrails.
- Resolve the launch name and waitlist model.
- Promote P1 items only when evidence shows they block activation, settlement,
  or retention.
- Do not begin multi-currency or broad social-ledger expansion until the PH-first
  settlement loop is validated.

---

## 19. Definition of Product Success

The beta succeeds when organizers consistently create a trustworthy ledger,
participants act from account-less links, and groups record confirmed
settlements without relying on a parallel spreadsheet or manual calculation.
The strongest evidence is not the number of expenses entered; it is that real
groups settle accurately, return for another shared event, and recommend the
workflow to the next organizer.
