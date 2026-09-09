/**
 * Expense-entry draft logic, kept free of React Native imports so it can be
 * unit-tested. Mirrors the web AddExpenseDialog rules: AI-suggested names
 * resolve only by exact match through the shared resolver, and a draft may
 * be applied only when every participant and the payer are resolved.
 */

import { resolveExactMember } from "@template/shared";
import type { ExpenseDraft } from "@template/shared/types";
import { z } from "zod";

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

/**
 * Receipt-level charges (tax, service) are the gap between the scanned grand
 * total and the scanned line items. They are kept as one explicit line shared
 * by everyone, so the expense total equals what was actually paid and the
 * user can still see and edit the surcharge. Discounts (negative gap) cannot
 * be a line item; the expense then totals the chosen items.
 */
export function reconcileReceipt(
  scanned: { total_cents: number; line_items: { total_cents: number }[] },
  reviewed: { description: string; total_cents: number; included?: boolean }[],
  participantIds: string[],
): { lineItems: DraftLineItem[]; totalCents: number; chargesCents: number } {
  const lineItems = receiptToLineItems(reviewed, participantIds);
  const includedSum = reviewed
    .filter((item) => item.included !== false && item.total_cents > 0)
    .reduce((sum, item) => sum + item.total_cents, 0);
  const scannedItemSum = scanned.line_items.reduce((sum, item) => sum + item.total_cents, 0);
  const chargesCents =
    scanned.line_items.length > 0 && scanned.total_cents > scannedItemSum
      ? scanned.total_cents - scannedItemSum
      : 0;
  if (chargesCents > 0) {
    lineItems.push({
      name: RECEIPT_CHARGES_LABEL,
      amountStr: (chargesCents / 100).toFixed(2),
      participantIds: [...participantIds],
    });
  }
  return { lineItems, totalCents: includedSum + chargesCents, chargesCents };
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
