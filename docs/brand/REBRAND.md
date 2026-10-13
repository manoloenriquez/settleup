# Talli brand inventory (SettleUp → Tabkind → Talli)

Date: 13 October 2026 · branch `feature/talli-rebrand-parity`

**Talli is the product name.** It was developed as *SettleUp*, renamed *Tabkind*
for a few weeks, and became *Talli* on 1 October 2026. This file records every
place an older name still exists, whether it is customer-visible, and why it
was renamed or kept. Read it before renaming anything that is stored, linked or
deployed.

## Result

- **Customer-visible:** no former name remains in the iPhone app, the web app,
  the PWA manifest, metadata, social preview, icons, splash, notifications or
  share pages. `apps/web/src/lib/__tests__/brand.test.ts` fails the build if
  `SettleUp`/`Tabkind` (any casing, word-bounded) appears in app source,
  modules, public assets metadata, `app.json` or `app.config.ts`.
- **Kept on purpose:** the database schema, storage and cache keys, URL schemes,
  deploy identities and the store/EAS identifiers below. Renaming them would
  lose data, break links or sign-in, or create new deployments.

The scan that produced this list: `rg -i "settle[-_ ]?up|tabkind"` over the
repository (267 files; ~240 are the `settleup` schema in migrations, SQL
tests, generated types and `.schema("settleup")` calls).

## Renamed in this pass

| Where | Before | After | Why safe |
|---|---|---|---|
| `apps/web/scripts/generate-icons.mjs` | rendered the word "SettleUp" into the social preview and wrote `og/settleup-social.png` | "Talli", writes `og/talli-social.png` (the file the metadata uses) | Script only; re-running it now reproduces the committed Talli assets instead of regressing them |
| `assets/brand/settleup-icon-master.png` | — | `assets/brand/talli-icon-master.png` | Only the generator reads it |
| `apps/web/src/app/page.tsx` | "AI receipt scanning … AI extracts line items", "Smart splits … let AI figure out", payment details "show up automatically" | Receipt scanning (Apple Intelligence on iPhone, text reading on web), plain-language entry with a phrase the web parser handles (tested), payment details shown only if you choose | Copy now matches what each platform does; no cloud AI is claimed |
| Root `package.json` name | `settleup` | `talli` | Not referenced by tooling, lockfile importers or CI |
| `apps/web/src/lib/log.ts` | `[settleup]` log prefix | `[talli]` | Server log text only |
| `AppleIntelligence.podspec` | author `SettleUp`, homepage `github.com/settleup` | `Talli`, the real repository | Local pod metadata |
| `apps/api/Dockerfile`, `render.yaml` comments, image tag example | "SettleUp API" | "Talli API" | Comments; Render service name kept (below) |
| `apps/api/Caddyfile` | `api.settleup.app` (a domain the project doesn't own) | `{$API_DOMAIN:localhost}` | Example reverse-proxy config, not used by Docker/Render |
| Code comments in `packages/shared` | "SettleUp schemas/types" | "Talli …" | Comments |
| Docs | README, design system, brain 00/01/03/04, private-beta checklist, PRD | Talli (PRD records the rename decision; dated reports left as history, `rebrand-ui-audit.md` marked superseded) | Docs |

## Kept on purpose

| Identifier | Where | Why it stays | To change it later |
|---|---|---|---|
| Postgres schema `settleup` and every table, RPC, policy, migration file name | `supabase/`, `.schema("settleup")` everywhere, `database.types.ts`, Data API "exposed schemas" | Renaming a schema breaks every client, policy, RPC grant and the migration history; migration files must never be renamed. It is not customer-visible | New-schema migration + dual-read period; not recommended |
| `createSettleUpDb`, `packages/supabase/src/settleup.ts`, `apps/web/src/lib/supabase/settleup.ts` | web Server Actions | Named for the schema, not the brand | Rename together with the schema, if ever |
| "Settle up" / `SettleUpButton` / `settle-up.tsx` | both apps, Assistant rules | The verb for recording a payment that clears a balance — product terminology, not the old brand | — |
| Storage keys `tabkind:outbox:v2:*`, `tabkind:query-cache:*`, `tabkind:expense-draft:v1:*`, `tabkind:auth-return:v1`, `tabkind:link-copied:*`, `tabkind:payment-report:*`, `settleup.push_token`, `settleup-outbox` (legacy outbox read), `settleup-query-cache` (cleanup) | AsyncStorage / IndexedDB / localStorage | Renaming orphans unsent offline changes, drafts and caches on existing installs | Read-old-write-new migration per key, then drop the old key a release later |
| Navigator lock `tabkind-outbox:<user>` | web outbox | Two tabs of different versions must share one lock during an upgrade | Change only with a version that takes both locks |
| URL schemes `tabkind` and `settleup` (`talli` is primary) | `app.json`, `app.config.ts` | `tabkind://auth/callback` is the OAuth/email callback in the Supabase redirect allowlist and installed builds; `settleup://` opens links already shared | Owner adds `talli://auth/callback` to the allowlist (`docs/launch/OWNER_ACTIONS.md`), ship `authCallbackUrl` on `talli`, keep both schemes until no installed build uses them |
| EAS slug `settleup` | `apps/mobile/app.json` | Must match the project on expo.dev; changing it breaks EAS builds/updates and push credentials | Rename the EAS project in the Expo dashboard first, then the slug |
| iOS bundle id `com.manoloenriquez.talli` | `app.json` | Already the Talli identity | — |
| Android package default `com.settleup.app` | `app.json` | Only used by local preview builds; production reads `ANDROID_PACKAGE` (enforced by `app.config.ts`). No Android release exists | Decide the Android id before the first Android release |
| Render service `settleup-api` | `render.yaml` | Renaming a service in a blueprint creates a second service and orphans the first | Rename in the Render dashboard, then the blueprint |
| Local Docker container `supabase_db_settleup`, repository folder and GitHub repo `settleup`, workspace package scope `@template/*` | dev tooling | Not customer-visible; renaming churns every path, import and script | Optional; not planned |
| `placeholderHost` regex contains `settleup.app` | `scripts/check-launch-config.mjs` | It rejects the old placeholder domain in release config — the guard should keep it | — |

## Asset specification (current, approved assets reused)

The icon is a wordless mark (two receipt halves joined by a check) — it carried
no brand text, so no new artwork was needed.

| Asset | Source | Spec |
|---|---|---|
| Master | `assets/brand/talli-icon-master.png` | 1024², full-bleed emerald `#047857`-family background, off-white mark |
| iOS/Expo icon | `apps/mobile/assets/icon.png` | 1024², from master |
| Splash | `apps/mobile/assets/splash.png` | 512² brand-colour mark on `#f8fafc` |
| Android adaptive/monochrome, notification | `apps/mobile/assets/*` | mark only, single colour |
| Web favicons, PWA 192/512, maskable, monochrome | `apps/web/public/icons/*` | from master |
| Social preview | `apps/web/public/og/talli-social.png` | 1200×630, "Talli" wordmark, "Split it fair. Settle it simple." |

Regenerate with `pnpm --filter @template/web gen:icons` (outputs are committed).
Brand colour `#059669` (emerald 600); theme/background `#f8fafc`.

**Needs a design/owner decision (not done here):** a distinct App Store name
(e.g. "Talli: Split Bills" — "Talli" alone is used by other apps) and a
trademark check; a dedicated wordmark if the store listing or marketing site
wants one; Supabase Auth email templates (configured in the dashboard, not in
the repo — check that their sender name and copy say Talli).

## Owner actions

1. Supabase → Auth → URL configuration: add `talli://auth/callback` (keep
   `tabkind://auth/callback`), then a build can move the callback to `talli`.
2. Supabase → Auth → Email templates and SMTP sender name: confirm "Talli".
3. App Store Connect: listing name and trademark clearance.
4. Optional: rename the EAS project and Render service in their dashboards
   first, then update `slug` / `render.yaml`.
