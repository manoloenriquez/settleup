import { z } from "zod";
import { CATEGORY_SLUGS, isCurrencyCode, type CurrencyCode, type ProposalAction } from "@template/shared";

// ---------------------------------------------------------------------------
// "Edit" on an Assistant preview opens the normal form with the preview's
// values filled in; nothing is saved until the person taps Save there. The
// values travel as one JSON route param and are validated again on arrival.
// ---------------------------------------------------------------------------

const currency = z.string().refine(isCurrencyCode) as unknown as z.ZodType<CurrencyCode>;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minor = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const ID = /^[0-9a-f-]{36}$/i;

export const personalPrefillSchema = z.object({
  amountMinor: minor,
  currency,
  description: z.string().max(120),
  date: isoDate,
  category: z.enum(CATEGORY_SLUGS),
});
export type PersonalPrefill = z.infer<typeof personalPrefillSchema>;

export const groupPrefillSchema = z.object({
  amountMinor: minor,
  currency,
  description: z.string().max(200),
  date: isoDate,
  payerMemberId: z.string().regex(ID),
  /** Equal → the simple form; anything else → exact amounts per person. */
  equal: z.boolean(),
  shares: z.array(z.object({ memberId: z.string().regex(ID), shareCents: z.number().int().nonnegative() })).min(1),
});
export type GroupPrefill = z.infer<typeof groupPrefillSchema>;

export type EditRoute =
  | { pathname: "/(protected)/expense/new"; params: { prefill: string } }
  | { pathname: "/(protected)/expense/[id]"; params: { id: string; prefill: string } }
  | { pathname: "/(protected)/groups/[id]/add-expense"; params: { id: string; prefill: string } }
  | {
      pathname: "/(protected)/groups/[id]/settle-up";
      params: { id: string; fromId: string; toId: string; amount: string; currency: string };
    };

/** Where "Edit" goes for a proposal, or null when it has no form to open. */
export function editRouteFor(action: ProposalAction): EditRoute | null {
  switch (action.type) {
    case "add_personal_expense": {
      const prefill: PersonalPrefill = {
        amountMinor: action.amountMinor,
        currency: action.currency,
        description: action.description,
        date: action.date,
        category: action.category,
      };
      return { pathname: "/(protected)/expense/new", params: { prefill: JSON.stringify(prefill) } };
    }
    case "edit_personal_expense": {
      // The expense's own form, with the proposed change filled in.
      const prefill: PersonalPrefill = {
        amountMinor: action.amountMinor,
        currency: action.currency,
        description: action.description,
        date: action.date,
        category: action.category,
      };
      return { pathname: "/(protected)/expense/[id]", params: { id: action.expenseId, prefill: JSON.stringify(prefill) } };
    }
    case "add_group_expense": {
      const prefill: GroupPrefill = {
        amountMinor: action.amountMinor,
        currency: action.currency,
        description: action.description,
        date: action.date,
        payerMemberId: action.payerMemberId,
        equal: action.splitMode === "equal",
        shares: action.shares,
      };
      return { pathname: "/(protected)/groups/[id]/add-expense", params: { id: action.groupId, prefill: JSON.stringify(prefill) } };
    }
    case "record_payment":
      return {
        pathname: "/(protected)/groups/[id]/settle-up",
        params: {
          id: action.groupId,
          fromId: action.fromMemberId,
          toId: action.toMemberId,
          amount: String(action.amountMinor),
          currency: action.currency,
        },
      };
    default:
      return null;
  }
}

function parse<T>(schema: z.ZodType<T>, raw: unknown): T | null {
  if (typeof raw !== "string" || raw.length > 20_000) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const parsePersonalPrefill = (raw: unknown): PersonalPrefill | null => parse(personalPrefillSchema, raw);
export const parseGroupPrefill = (raw: unknown): GroupPrefill | null => parse(groupPrefillSchema, raw);
