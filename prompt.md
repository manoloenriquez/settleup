You are Claude Code acting as a senior full-stack engineer. Build an MVP app called “SettleUp Lite” using my existing template repo. The template repo contains:

- Next.js (web + admin interface)
- Expo (mobile)
- Supabase (DB + auth if present, storage, edge functions if used)

MVP ASSUMPTIONS:

- Current user is ALWAYS the payer/collector (“me”). No multi-payer settlements.
- Friends do NOT need to log in for MVP. They should be able to open a shareable link and see what they owe + my payment details.
- Currency: PHP (₱).
- No OCR in MVP (architecture placeholder is okay).

PRIMARY GOAL:
Make it extremely easy to:

1. track group expenses and splits (equal split MVP)
2. generate a shareable link that friends can open to see:
   - how much they owe
   - payment options (bank info, GCash number, QR codes)
   - copy-friendly text they can paste into a groupchat

PRODUCT SHAPE:
Two surfaces:
A) Payer app (logged-in or “owner mode”): create group, add members, add expenses, see totals, mark paid, edit payment details
B) Friend view (NO LOGIN): shareable link per friend per group that displays their exact amount owed + payment info + QR images + “Mark as paid” is NOT available (view-only)

REPO-FIRST APPROACH:

- First inspect the repo: packages/apps, routing, UI kit, state management, supabase client, env conventions, storage conventions, lint/test setup, existing auth patterns.
- Follow existing conventions strictly. Do not introduce new frameworks unless necessary.

DATA MODEL (Supabase):
Use integer cents for money (avoid float issues).
Tables:

1. groups

- id uuid pk default gen_random_uuid()
- name text not null
- created_at timestamptz default now()
- owner_user_id uuid nullable (ok if you use auth for payer)
- invite_code text unique (short code)
- is_archived boolean default false

2. group_members

- id uuid pk
- group_id uuid fk -> groups.id on delete cascade
- display_name text not null
- created_at timestamptz default now()
- slug text not null (url-safe identifier within group, unique per group)
- share_token text unique not null (random secret for link access)
  UNIQUE (group_id, slug)

3. expenses

- id uuid pk
- group_id uuid fk -> groups.id
- item_name text not null
- amount_cents bigint not null
- notes text null
- created_at timestamptz default now()

4. expense_participants

- expense_id uuid fk -> expenses.id on delete cascade
- member_id uuid fk -> group_members.id on delete cascade
- share_cents bigint not null
  PK (expense_id, member_id)

5. payments

- id uuid pk
- group_id uuid fk -> groups.id
- member_id uuid fk -> group_members.id
- amount_cents bigint not null
- status text not null default 'PAID' check in ('PAID')
- created_at timestamptz default now()

6. payment_profiles (payer payment details per group)

- group_id uuid pk fk -> groups.id
- payer_display_name text null (e.g., “Nols”)
- gcash_name text null
- gcash_number text null
- bank_name text null
- bank_account_name text null
- bank_account_number text null
- notes text null (instructions)
- gcash_qr_url text null (Supabase Storage public URL or signed URL)
- bank_qr_url text null (Supabase Storage public URL or signed URL)
- updated_at timestamptz default now()

RLS + SECURITY:
This MVP must support “friend view without login” safely:

- Friends should ONLY be able to view data relevant to their link (their member row, their computed owed amount, group name, payment profile).
  Implementation approach:
  Option A (preferred): Edge Function “friend-view” that takes share_token and returns a sanitized payload:
  { group, member, owed_cents, payment_profile, compact_message }
  This avoids opening up RLS for anon reads.
  Option B: RLS with anon access filtered by share_token (trickier). Only do if repo already has a clean pattern for anon + token.

Pick the simplest secure approach that fits repo conventions. If Edge Functions exist in the template, use them.

BALANCE LOGIC:
owed_cents(member) =
sum(expense_participants.share_cents for all expenses in group)

- sum(payments.amount_cents where payments.member_id = member.id)
  Since payer is always “me”, everyone owes payer. Show 0 if overpaid (cap at 0 for display).

MVP FEATURES (PAYER MODE):

1. Create group

- group name
- immediately shows shareable “groupchat summary” block (initially empty)
- generates invite_code + allows adding members

2. Add members (manual for MVP)

- input display names
- auto-generate unique slug from name (lowercase, hyphen, dedupe with -2, -3)
- generate share_token (strong random, e.g., 32+ chars)

3. Add expense in 2 ways:
   A) Form: item, amount (₱), participants multi-select (default all), notes optional
   B) Chat-style input: “Wahunori 8703.39 split Manolo Yao Alvaro …”
   Parser rules:

- amount is first number token (allow commas)
- keyword “split” optional; if missing -> all members
- participants after “split”
- item_name = tokens before amount
- fuzzy match names to existing members (case-insensitive contains/startsWith)
- if ambiguous/unmatched -> show confirm UI and require user to pick

When saved:

- compute equal split in cents with fair remainder distribution:
  e.g., total=100 cents, n=3 => [34,33,33] (distribute remainder to first participants deterministically by member_id order).
- write expense + participants rows

4. Overview / Balances

- list members with owed amount + Paid/Pending state
- quick action: “Copy compact groupchat message” that outputs:
  FINAL AMOUNTS TO PAY (TO ME)
  Name — ₱x,xxx.xx
  ...
  TOTAL: ₱xx,xxx.xx

5. Share links
   For each member row, provide:

- “Copy link” to friend view
- “Copy message to this person” that includes amount + link + payment info snippet

Link format (choose based on repo):

- Web: https://<domain>/g/[invite_code]/m/[slug]?t=[share_token]
  or shorter:
- https://<domain>/p/[share_token]
  If you can support short routes in Next.js, do /p/[share_token] to reduce friction.

6. Payment profile (payer’s details)
   Create an “Add Payment Details” screen/modal:

- payer_display_name
- GCash number + name
- bank info
- notes/instructions
- upload QR images (GCash QR, bank QR)
  Store images in Supabase Storage. Friend view must be able to display them:
- Prefer public bucket with random file names OR signed URLs generated server-side (edge function).
  Follow repo security best practice.

7. Mark paid
   In payer mode only:

- “Mark paid” sets payment amount = current owed (create payment row).
- Allow undo (delete latest payment or create negative? simplest: delete last payment record for that member if within MVP constraints).
  If undo is too complex, provide “Reset payments for member” confirmation.

FRIEND VIEW (NO LOGIN):
Given a share_token:

- show group name
- show: “Hi <Name>, you owe ₱X,XXX.XX”
- show payment details clearly:
  - GCash number + name + copy button
  - bank details + copy
  - QR images (tap to zoom / open)
  - notes/instructions
- show “Copy message” for them to paste (includes amount + payment options)
- (optional) show list of expenses they’re included in (nice-to-have; if fast, include)
- DO NOT expose other members’ amounts or details.

PLATFORMS:

- Next.js web: primary surface for payer mode + friend view.
- Expo app: minimal payer companion for quick add expense and viewing balances.
  If time is limited, implement full payer + friend view on Next.js first, then Expo second, reusing shared logic packages if repo has them.

TESTS:

- Unit tests for:
  - parser (chat-style input)
  - split algorithm (remainder handling)
  - owed_cents computation
    Use repo’s test runner (Vitest/Jest/etc.). Follow repo conventions.

UI/UX REQUIREMENTS:

- Mobile-first responsive layouts on web (friends will open via phone).
- Big copy buttons (Copy link, Copy GCash, Copy bank, Copy message).
- Clear status badges: Paid / Pending.
- Good empty states: “No expenses yet”, “Add members to start”.

SEED / DEMO DATA:
Add a dev-only seed script or admin action that creates:

- a sample group with members [Manolo, Yao, Alvaro, Dustin, Carlos, Shaun, Luigi]
- expenses matching:
  Wahunori 8703.39 split all 7
  Green Pepper 2717 split Manolo Yao Alvaro Dustin
  Eastwing and Raion 8299.98 split Manolo Yao Alvaro
  adjustments can be skipped or modeled as separate expense/payment if you want, but not required
  Make sure totals match expected with cent rounding.

DELIVERABLES:

- Working MVP in repo
- SQL migrations or Supabase migration files (as per repo)
- Any edge functions needed (friend view payload and/or signed QR URL generation)
- README updates: setup, env vars, how to run web + expo, how friend links work
- “Next improvements” (OCR, unequal splits, multi-payer settlements, reminders, analytics)

MINIMAL QUESTIONS (ask only if you cannot infer from repo inspection):

1. What is the intended deployment domain (needed to generate full share URLs) — if unknown, use relative links + copy relative.
2. Should friend links ever expire? (Default: no expiry for MVP; token can be rotated by payer.)
   If you can proceed without asking, proceed.

WORK PLAN:

1. Inspect repo and summarize stack + conventions (brief).
2. Create Supabase migrations + storage bucket setup.
3. Implement shared lib: money utils (cents), parser, split, balance calc.
4. Implement Next.js:
   - payer pages: groups list, group detail, add members, add expense, payment profile, payments
   - friend view route: /p/[share_token] (or equivalent)
5. Implement edge function (if chosen) and hook it up.
6. Implement Expo minimal screens (reuse API + shared libs) OR stub if repo time constraints.
7. Tests + lint + README.

SHORT SHARE TOKEN REQUIREMENT:

Use a short, URL-friendly share token for friend links.

Requirements:

- Length: 10 characters
- Character set: Base62 (A–Z, a–z, 0–9)
- Example: "aB3kP9xT2Q"
- Case-sensitive
- No symbols, only alphanumeric
- Must be cryptographically random (NOT sequential, NOT derived from IDs)

Security target:

- Minimum entropy: ~60 bits
- This makes tokens unguessable in practice.

Implementation:

Database change:
group_members.share_token text unique not null

Generation logic:
Use secure RNG:

- Node.js: crypto.randomBytes
- Expo: expo-crypto or equivalent secure RNG
- DO NOT use Math.random()

Example implementation (Node.js):

function generateShareToken(length = 10) {
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const bytes = crypto.randomBytes(length)
let result = ''
for (let i = 0; i < length; i++) {
result += chars[bytes[i] % chars.length]
}
return result
}

On collision (very unlikely):

- regenerate until unique

Friend link format:

Preferred short format:
https://<domain>/p/<share_token>

Example:
https://settle.app/p/aB3kP9xT2Q

Next.js routing:
Create route:
app/p/[share_token]/page.tsx

This page fetches friend-view payload via:

- Supabase Edge Function OR
- Supabase query filtered by share_token with proper security

Optional future enhancement (not required for MVP):

- Allow token regeneration (invalidate old links)
- Allow group-level token and member-level tokens

Do not use UUIDs or long tokens in URLs. Only use the short share_token.

Proceed now.
