/**
 * Expense-entry draft logic, kept free of React Native imports so it can be
 * unit-tested. Mirrors the web AddExpenseDialog rules: AI-suggested names
 * resolve only by exact match through the shared resolver, and a draft may
 * be applied only when every participant and the payer are resolved.
 */

import { equalSplit, resolveExactMember } from "@template/shared";
import type { ExpenseDraft } from "@template/shared/types";
import { z } from "zod";
import { currencyCodeSchema } from "@template/shared";

export type DraftMember = { id: string; display_name: string; departed_at?: string | null };

export type DraftParticipant = {
  /** Name the AI suggested; null when the AI named nobody and everyone was assumed. */
  suggested: string | null;
  /** Resolved member id, or "" when the name is unknown or ambiguous. */
  memberId: string;
};

export type DraftResolution = {
  payerSuggested: string | null;
  payerId: string;
  participants: DraftParticipant[];
};

export function activeMembers<M extends DraftMember>(members: M[]): M[] {
  return members.filter((member) => !member.departed_at);
}

/** Resolves a chat draft's names against the group. Unknown names stay unresolved. */
export function resolveDraft(draft: ExpenseDraft, members: DraftMember[]): DraftResolution {
  const active = activeMembers(members);
  const participants =
    draft.participant_names.length > 0
      ? draft.participant_names.map((name) => ({
          suggested: name,
          memberId: resolveExactMember(name, active) ?? "",
        }))
      : active.map((member) => ({ suggested: null, memberId: member.id }));
  return {
    payerSuggested: draft.payer_name,
    payerId: resolveExactMember(draft.payer_name, active) ?? "",
    participants,
  };
}

/** True when the payer and every participant are distinct active members. */
export function isDraftResolved(resolution: DraftResolution, members: DraftMember[]): boolean {
  const valid = new Set(activeMembers(members).map((member) => member.id));
  const ids = resolution.participants.map((participant) => participant.memberId);
  return (
    valid.has(resolution.payerId) &&
    ids.length > 0 &&
    ids.every((id) => valid.has(id)) &&
    new Set(ids).size === ids.length
  );
}

/** Whether the user changed anything from the automatic resolution. */
export function resolutionEdited(auto: DraftResolution, current: DraftResolution): boolean {
  if (auto.payerId !== current.payerId) return true;
  if (auto.participants.length !== current.participants.length) return true;
  return auto.participants.some((p, index) => p.memberId !== current.participants[index]?.memberId);
}

export type SmartSplitSuggestion = { member_name: string; share_cents: number };

/** Maps AI split suggestions to member ids; unmatched names are reported, never guessed. */
export function applySmartSplit(
  suggestions: SmartSplitSuggestion[],
  members: DraftMember[],
): { shares: Record<string, string>; unmatched: string[] } {
  const active = activeMembers(members);
  const shares: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const suggestion of suggestions) {
    const id = resolveExactMember(suggestion.member_name, active);
    if (id) shares[id] = (suggestion.share_cents / 100).toFixed(2);
    else unmatched.push(suggestion.member_name);
  }
  return { shares, unmatched };
}

export type DraftLineItem = { name: string; amountStr: string; participantIds: string[] };

export const RECEIPT_CHARGES_LABEL = "Tax & charges";

/** Turns reviewed receipt items into itemized-mode line items shared by everyone. */
export function receiptToLineItems(
  items: { description: string; total_cents: number; included?: boolean }[],
  participantIds: string[],
): DraftLineItem[] {
  const included = items.filter((item) => item.included !== false && item.total_cents > 0);
  return included.map((item, index) => ({
    name: item.description.trim() || `Item ${index + 1}`,
    amountStr: (item.total_cents / 100).toFixed(2),
    participantIds: [...participantIds],
  }));
}

export type DescribedSplit = {
  splitMode: "equal" | "percent" | "shares" | "custom";
  percentShares: Record<string, string>;
  shareWeights: Record<string, string>;
  customShares: Record<string, string>;
  excludedMemberIds: string[];
};

const EMPTY_SPLIT: DescribedSplit = { splitMode: "equal", percentShares: {}, shareWeights: {}, customShares: {}, excludedMemberIds: [] };

/**
 * Turns the split a user described in chat ("60/40", "Ana had two", "Ben pays
 * 200, rest equal", "except Mia") into the Detailed form's inputs. Names are
 * matched to the already-resolved participants; anything that does not match
 * falls back to an equal split so nothing is silently misassigned.
 */
export function applyDraftSplit(
  split: ExpenseDraft["split"] | null,
  participants: { memberId: string | null; name: string }[],
  amountCents: number,
): DescribedSplit {
  if (!split || split.shares.length === 0) return EMPTY_SPLIT;
  const resolved = participants.filter((p): p is { memberId: string; name: string } => p.memberId !== null);
  const idFor = (name: string): string | null =>
    resolved.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())?.memberId ?? null;
  const entries = split.shares.map((share) => ({ share, memberId: idFor(share.member_name) }));
  if (entries.some((e) => e.memberId === null)) return EMPTY_SPLIT;

  switch (split.mode) {
    case "percent": {
      const percentShares: Record<string, string> = {};
      let sum = 0;
      for (const { share, memberId } of entries) {
        const percent = share.excluded ? 0 : share.percent ?? 0;
        percentShares[memberId!] = String(percent);
        sum += percent;
      }
      if (Math.abs(sum - 100) > 0.01) return EMPTY_SPLIT;
      return { ...EMPTY_SPLIT, splitMode: "percent", percentShares };
    }
    case "shares": {
      const shareWeights: Record<string, string> = {};
      const excludedMemberIds: string[] = [];
      for (const { share, memberId } of entries) {
        if (share.excluded) excludedMemberIds.push(memberId!);
        else shareWeights[memberId!] = String(share.weight ?? 1);
      }
      return { ...EMPTY_SPLIT, splitMode: "shares", shareWeights, excludedMemberIds };
    }
    case "exclude": {
      const excludedMemberIds = entries.filter((e) => e.share.excluded).map((e) => e.memberId!);
      if (excludedMemberIds.length === 0 || excludedMemberIds.length >= resolved.length) return EMPTY_SPLIT;
      return { ...EMPTY_SPLIT, splitMode: "equal", excludedMemberIds };
    }
    case "fixed": {
      const fixed = new Map<string, number>();
      for (const { share, memberId } of entries) {
        if (share.excluded) fixed.set(memberId!, 0);
        else if (share.fixed_cents !== null) fixed.set(memberId!, share.fixed_cents);
      }
      const fixedSum = [...fixed.values()].reduce((s, c) => s + c, 0);
      if (fixedSum > amountCents) return EMPTY_SPLIT;
      const rest = resolved.filter((p) => !fixed.has(p.memberId));
      if (rest.length === 0 && fixedSum !== amountCents) return EMPTY_SPLIT;
      const restShares = rest.length > 0 ? equalSplit(amountCents - fixedSum, rest.length) : [];
      const customShares: Record<string, string> = {};
      for (const p of resolved) {
        const cents = fixed.get(p.memberId) ?? restShares[rest.findIndex((r) => r.memberId === p.memberId)] ?? 0;
        customShares[p.memberId] = (cents / 100).toFixed(2);
      }
      return { ...EMPTY_SPLIT, splitMode: "custom", customShares };
    }
  }
}

export type SeededReceiptItem = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  included: boolean;
};

/**
 * Seeds the editable receipt review from a scan so that the included items
 * already add up to what was paid:
 *
 * - Receipt-level charges (service, additive tax, tip) are the gap between the
 *   scanned grand total and the items. They become one explicit "Tax & charges"
 *   line everyone shares, so the surcharge stays visible and editable.
 * - A discount (total below the items) cannot be a line item; each item is
 *   scaled down proportionally instead, which is how a "40% promo" is felt by
 *   each person. Largest-remainder rounding keeps the cents exact.
 * - A totals-only scan becomes a single line for the whole amount.
 */
export function seedReceiptItems(
  scanned: {
    merchant: string | null;
    total_cents: number;
    line_items: { description: string; quantity: number; unit_price_cents: number; total_cents: number }[];
  },
): { items: SeededReceiptItem[]; chargesCents: number; discountCents: number } {
  const items = scanned.line_items.filter((item) => item.total_cents > 0);
  if (items.length === 0) {
    const total = Math.max(scanned.total_cents, 0);
    return {
      items: [{ description: scanned.merchant ?? "Total", quantity: 1, unit_price_cents: total, total_cents: total, included: true }],
      chargesCents: 0,
      discountCents: 0,
    };
  }
  const itemSum = items.reduce((sum, item) => sum + item.total_cents, 0);
  const seeded: SeededReceiptItem[] = items.map((item) => ({ ...item, included: true }));
  if (scanned.total_cents > itemSum) {
    const chargesCents = scanned.total_cents - itemSum;
    seeded.push({ description: RECEIPT_CHARGES_LABEL, quantity: 1, unit_price_cents: chargesCents, total_cents: chargesCents, included: true });
    return { items: seeded, chargesCents, discountCents: 0 };
  }
  if (scanned.total_cents > 0 && scanned.total_cents < itemSum) {
    const discountCents = itemSum - scanned.total_cents;
    const scaled = scaleToTotal(seeded.map((item) => item.total_cents), scanned.total_cents);
    return {
      items: seeded.map((item, index) => {
        const total_cents = scaled[index] ?? 0;
        return { ...item, total_cents, unit_price_cents: item.quantity > 0 ? Math.round(total_cents / item.quantity) : total_cents };
      }),
      chargesCents: 0,
      discountCents,
    };
  }
  return { items: seeded, chargesCents: 0, discountCents: 0 };
}

/** Scales integer cents proportionally so they sum exactly to `target` (largest remainder). */
export function scaleToTotal(cents: number[], target: number): number[] {
  const sum = cents.reduce((s, c) => s + c, 0);
  if (sum <= 0 || target < 0) return cents.map(() => 0);
  const exact = cents.map((c) => (c * target) / sum);
  const floored = exact.map(Math.floor);
  let remainder = target - floored.reduce((s, c) => s + c, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floored[index] = (floored[index] ?? 0) + 1;
    remainder -= 1;
  }
  return floored;
}

// ---------------------------------------------------------------------------
// Persisted in-progress draft (per group)
// ---------------------------------------------------------------------------

export const persistedDraftSchema = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  mode: z.enum(["quick", "chat", "receipt", "detailed", "itemized"]),
  itemName: z.string(),
  amount: z.string(),
  notes: z.string(),
  selectedMemberIds: z.array(z.string()),
  payerMemberId: z.string(),
  categoryId: z.string().nullable(),
  expenseDate: z.string(),
  splitMode: z.enum(["equal", "percent", "shares", "custom"]),
  customShares: z.record(z.string(), z.string()),
  percentShares: z.record(z.string(), z.string()),
  shareWeights: z.record(z.string(), z.string()),
  repeats: z.enum(["none", "weekly", "monthly"]),
  multiPayer: z.boolean(),
  payerAmounts: z.record(z.string(), z.string()),
  lineItems: z.array(
    z.object({ name: z.string(), amountStr: z.string(), participantIds: z.array(z.string()) }),
  ),
  /** Absent in drafts saved before currencies existed — those were pesos. */
  currencyCode: currencyCodeSchema.optional(),
});

export type PersistedDraft = z.infer<typeof persistedDraftSchema>;

/** Drafts are private to the account that typed them, like the query cache. */
export function draftStorageKey(userId: string, groupId: string): string {
  return `tabkind:expense-draft:v1:${userId}:${groupId}`;
}

/** A draft worth keeping has something the user typed, not just defaults. */
export function isDraftEmpty(draft: Pick<PersistedDraft, "itemName" | "amount" | "notes" | "lineItems">): boolean {
  return (
    draft.itemName.trim() === "" &&
    draft.amount.trim() === "" &&
    draft.notes.trim() === "" &&
    draft.lineItems.every((item) => item.name.trim() === "" && item.amountStr.trim() === "")
  );
}

export function parsePersistedDraft(raw: string | null): PersistedDraft | null {
  if (!raw) return null;
  try {
    const parsed = persistedDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
