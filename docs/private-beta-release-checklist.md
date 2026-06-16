# Private Beta Release Checklist

Use this before inviting trusted friends to use SettleUp on a real trip or group hangout.

## Database

- Apply all Supabase migrations through `20260601000001_expense_categories.sql`.
- Confirm RLS is enabled on every `settleup` table, including `expense_categories`.
- Confirm the payment RPCs are deployed: `record_payment`, `undo_last_payment`, and `undo_last_payment_for_member`.
- Verify category behavior in a staging project:
  - Global default categories are visible to all signed-in group members.
  - Custom group categories are visible only to members of that group.
  - Only group owners/admins can create, update, reorder, or delete custom categories.
  - Deleted custom categories move existing expenses to `Other`.

## Environment

- Web env vars are set for Supabase URL and publishable key.
- Mobile env vars are set for Supabase URL, publishable key, and `EXPO_PUBLIC_WEB_URL`.
- `LLM_ENABLED` and any provider keys are configured intentionally; leave disabled if AI is not part of the beta.
- No service role key is present in web or mobile runtime env.

## Auth

- Supabase email redirect URLs include the production web URL and any preview/beta URLs.
- OAuth redirect URLs are verified for Google/Apple if enabled.
- Account deletion route works in API only and uses the service role key only for authenticated self-deletion.

## Observability

- Sentry DSNs are configured for web, API, and mobile preview builds.
- Source maps are enabled where appropriate.
- Basic error alerts are routed to the owner during beta.

## Web QA

- Create a group and complete the setup checklist.
- Add members, claim a member profile, and add payment details.
- Add quick, detailed, custom split, itemized, receipt, and chat expenses with categories.
- Create, rename, recolor, reorder, and delete a custom category.
- Edit an expense category.
- View categories in expense list, activity, public group link, friend link, and insights.
- Record and undo payments as owner, admin, and regular member.

## Mobile QA

- Install an EAS preview build on at least one iOS and one Android device.
- Repeat the full web QA flow on mobile.
- Confirm the group header overflow menu contains secondary actions and the primary add-expense flow remains easy to reach.
- Confirm receipt scan and chat confirmation allow the category to be reviewed before saving.

## Share Links

- Verify `/p/*` and `/g/*` public links rate-limit repeated requests.
- Confirm public pages use generic metadata and do not expose private payment account numbers unmasked.
- Confirm category metadata on public pages includes only category name, slug, icon, color, and default/custom status.

## Launch Decision

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` pass.
- Known beta limitations are documented for testers.
- Support/feedback email is reachable from both web and mobile account screens.
