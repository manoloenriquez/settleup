# SettleUp — Rebrand & UI/UX Audit

Date: 2026-04-06

---

## A. Branding Audit

### What was found

| Category | File | Change |
|----------|------|--------|
| Central constant | `packages/shared/src/constants/index.ts:5` | `"SettleUp Lite"` → `"SettleUp"` (propagated to 11 UI files) |
| Web metadata | `apps/web/src/app/layout.tsx:10-11` | title default + template |
| Mobile header | `apps/mobile/app/(protected)/(tabs)/dashboard.tsx:28` | Refactored to use `APP_NAME` |
| AI prompts | `apps/web/src/lib/ai/conversation.ts`, `apps/mobile/src/lib/ai/conversation.ts` | System prompt text |
| Mobile app config | `apps/mobile/app.json:3` | Display name (slug + bundle IDs kept unchanged) |
| Root package | `package.json:2` | `"prototype-template"` → `"settleup"` |
| Env example | `apps/mobile/.env.example:6` | `"Prototype Template"` → `"SettleUp"` |
| Docs | `README.md`, `prompt.md`, `docs/audit-action-plan.md`, `docs/audit-report.md`, `docs/brain/00-overview.md` | Heading/body text |
| Code comments | `packages/shared/src/schemas/index.ts`, `packages/shared/src/types/index.ts`, `supabase/migrations/20250223000000_settleup_lite.sql` | Comment text only (migration file not renamed) |

**Total files changed: 16**

### Copy improvements
- Meta description updated: "Split expenses. Settle up. Track balances and simplify debts with your group."
- Migration filenames left unchanged (Supabase tracks applied migrations by filename — renaming would cause re-application)

---

## B. UI/UX Audit

### Web

#### Design System
- **Before:** No `tailwind.config.ts` — all brand colors were ad-hoc `indigo-*` classes scattered across components
- **After:** `@theme` block in `globals.css` defines `--color-brand-*` tokens (50–900 scale). All 14 UI primitives now use `brand-*` instead of `indigo-*`
- Changing the brand color in the future requires editing one `@theme` block, not dozens of files

#### Bugs fixed
1. **ForgotPasswordForm** (`apps/web/src/components/auth/ForgotPasswordForm.tsx`) — was silently ignoring server errors; now checks `result.error` and shows red alert
2. **GroupListItem** (`apps/web/src/components/groups/GroupListItem.tsx`) — archive dialog had wrong `confirmVariant="secondary"`; corrected to `"danger"`
3. **GroupSettingsClient** (`apps/web/src/components/groups/GroupSettingsClient.tsx`) — `window.confirm()` for ownership transfer replaced with `<Dialog>` component
4. **BalanceSummary** (`apps/web/src/components/groups/BalanceSummary.tsx`) — undo payment button had no confirmation; now opens a `<Dialog>` before executing

#### UI consistency
- **GroupList** (`apps/web/src/components/groups/GroupList.tsx`) — raw `<select>` replaced with `<Select>` component; sort dropdown focus ring now uses `brand-*` token
- **ExpenseList** (`apps/web/src/components/groups/ExpenseList.tsx`) — raw `<input>` search replaced with `<Input>` component
- **LoginForm** (`apps/web/src/components/auth/LoginForm.tsx`) — duplicate `<h2>` heading removed (page + form both rendered the app name)
- **Dashboard** (`apps/web/src/app/(protected)/dashboard/page.tsx`) — "Scan Receipt" quick action (which linked to the groups list) renamed to "View Groups" with `Users` icon

#### Missing loading states (added)
- `apps/web/src/app/(protected)/groups/new/loading.tsx`
- `apps/web/src/app/(protected)/account/payment/loading.tsx`
- `apps/web/src/app/(protected)/groups/[groupId]/settings/loading.tsx`

### Mobile

#### Theme token enforcement
- **Before:** `Button.tsx`, `TextInput.tsx`, `login.tsx`, `register.tsx`, `_layout.tsx`, `(protected)/_layout.tsx` all used hardcoded hex strings
- **After:** All hardcoded hex values replaced with imports from `@/theme`. Single source of truth for all color values

#### Bugs fixed
1. **Dashboard** (`apps/mobile/app/(protected)/(tabs)/dashboard.tsx`) — `isRefreshing` was hardcoded to `false`; replaced with `useState` + async `handleRefresh`
2. **Group Settings** (`apps/mobile/app/(protected)/groups/[id]/settings.tsx`) — `Alert.prompt` (iOS-only API) for member rename replaced with cross-platform inline edit state

#### Tab bar improvement
- Emoji characters (`🏠👥👤`) replaced with `@expo/vector-icons` Ionicons
- Focused/unfocused states use `home`/`home-outline`, `people`/`people-outline`, `person`/`person-outline`
- Icon color: `colors.primary` (focused), `colors.gray400` (unfocused)

---

## C. Benchmark vs Splitwise

### What Splitwise does better
- Rich expense categorization (food, transport, utilities, etc.) with icons
- Recurring expenses
- Multi-currency support
- Activity feed with full audit trail
- Push notifications for new expenses and payments
- Debt simplification across groups (not just within)
- CSV export

### What SettleUp now does comparably
- Group expense splitting with equal and custom splits
- AI-powered expense parsing (chat + receipt OCR)
- Multi-payer support
- Simplified debts within a group
- Shareable public links for members without accounts
- Payment profile (GCash + bank) with QR
- Mobile + web with feature parity

### Where SettleUp can differentiate
- **AI-first expense entry** — faster than Splitwise's form-based flow
- **Receipt scanning** — built-in OCR with line-item splitting
- **Smart split suggestions** — AI-suggested splits based on conversation context
- **Public share links** — no account needed for friends to view their balance
- **Philippine peso focus** — GCash-first payment workflow matches local market

---

## Remaining improvements (deferred)

- Dark mode (requires full theme token duplication)
- FlatList pagination for expense/activity lists (needs backend cursor support)
- Expense categories with icons
- Push notifications
- CSV/PDF export
- Activity feed improvements
