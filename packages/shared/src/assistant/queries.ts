import { formatAmount } from "../utils/amount";
import type { CurrencyCode } from "../utils/currency";
import { simplifyDebts } from "../utils/debts";
import { resolveDateMention } from "../utils/date-mention";
import type { AnswerCard, AssistantSnapshot, SnapshotExpense, SnapshotGroup } from "./types";

// ---------------------------------------------------------------------------
// Read-only answers, computed from the same data the screens show. Amounts are
// summed per currency and never converted or mixed.
// ---------------------------------------------------------------------------

export type DateRange = { from: string; to: string; label: string };

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseISO(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** "this month", "last week", "in September", "yesterday" → inclusive range. */
export function rangeFromMention(mention: string | null, today: string): DateRange | null {
  if (!mention) return null;
  const text = mention.trim().toLowerCase();
  const base = parseISO(today);
  if (/^(this|ngayong) (month|buwan)$/.test(text)) {
    return { from: iso(new Date(base.getFullYear(), base.getMonth(), 1)), to: today, label: "this month" };
  }
  if (/^(last|nakaraang) (month|buwan)$/.test(text)) {
    const start = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    const end = new Date(base.getFullYear(), base.getMonth(), 0);
    return { from: iso(start), to: iso(end), label: "last month" };
  }
  if (/^this week$/.test(text)) {
    const start = new Date(base);
    start.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    return { from: iso(start), to: today, label: "this week" };
  }
  if (/^last week$/.test(text)) {
    const start = new Date(base);
    start.setDate(base.getDate() - ((base.getDay() + 6) % 7) - 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: iso(start), to: iso(end), label: "last week" };
  }
  if (/^this year$/.test(text)) {
    return { from: `${base.getFullYear()}-01-01`, to: today, label: "this year" };
  }
  const month = MONTHS.findIndex((m) => text === m || text === `in ${m}` || text === m.slice(0, 3));
  if (month >= 0) {
    const year = month > base.getMonth() ? base.getFullYear() - 1 : base.getFullYear();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return { from: iso(start), to: iso(end), label: MONTHS[month]![0]!.toUpperCase() + MONTHS[month]!.slice(1) };
  }
  const day = resolveDateMention(text, today);
  return day ? { from: day, to: day, label: text } : null;
}

export function inRange(date: string, range: DateRange | null): boolean {
  return !range || (date >= range.from && date <= range.to);
}

function addTo(map: Map<CurrencyCode, number>, currency: CurrencyCode, amount: number): void {
  map.set(currency, (map.get(currency) ?? 0) + amount);
}

export function moneyList(map: Map<CurrencyCode, number>): string {
  const parts = [...map.entries()].filter(([, v]) => v !== 0).map(([c, v]) => formatAmount(v, c));
  return parts.length ? parts.join(" + ") : "nothing";
}

export function groupLabel(group: SnapshotGroup): string {
  return group.isDirect && group.friendName ? `With ${group.friendName}` : group.name;
}

/** My net position per group and currency. */
export function balanceOverview(snapshot: AssistantSnapshot): { text: string; card: AnswerCard } {
  const owed = new Map<CurrencyCode, number>();
  const owe = new Map<CurrencyCode, number>();
  const rows: Extract<AnswerCard, { type: "balances" }>["rows"] = [];
  let missing = 0;
  for (const group of snapshot.groups) {
    if (group.archived || !group.myMemberId) continue;
    if (!group.balances) {
      missing++;
      continue;
    }
    for (const balance of group.balances) {
      const mine = balance.net.find((n) => n.memberId === group.myMemberId)?.amountMinor ?? 0;
      if (mine === 0) continue;
      if (mine > 0) addTo(owed, balance.currency, mine);
      else addTo(owe, balance.currency, -mine);
      rows.push({
        label: groupLabel(group),
        amountMinor: Math.abs(mine),
        currency: balance.currency,
        sub: mine > 0 ? "you're owed" : "you owe",
      });
    }
  }
  rows.sort((a, b) => b.amountMinor - a.amountMinor);
  let text =
    rows.length === 0
      ? "You're all settled up."
      : `You're owed ${moneyList(owed)} and you owe ${moneyList(owe)}.`;
  if (missing > 0) text += ` ${missing} group${missing === 1 ? "" : "s"} haven't loaded yet and aren't included.`;
  return { text, card: { type: "balances", title: "Your balances", rows } };
}

/**
 * What a person owes me (positive) or I owe them (negative) in one group and
 * currency, using the same simplified "who pays whom" the group screen shows.
 */
export function pairwiseBalance(group: SnapshotGroup, otherMemberId: string): Map<CurrencyCode, number> {
  const result = new Map<CurrencyCode, number>();
  if (!group.myMemberId || !group.balances) return result;
  for (const balance of group.balances) {
    const names = new Map(group.members.map((m) => [m.id, m.name]));
    const debts = simplifyDebts(
      balance.net.map((n) => ({ member_id: n.memberId, display_name: names.get(n.memberId) ?? "", net_cents: n.amountMinor })),
    );
    let net = 0;
    for (const debt of debts) {
      if (debt.from_member_id === otherMemberId && debt.to_member_id === group.myMemberId) net += debt.amount_cents;
      if (debt.from_member_id === group.myMemberId && debt.to_member_id === otherMemberId) net -= debt.amount_cents;
    }
    if (net !== 0) result.set(balance.currency, net);
  }
  return result;
}

export function balanceWithPerson(
  snapshot: AssistantSnapshot,
  personLabel: string,
  memberByGroup: Map<string, string>,
): { text: string; card: AnswerCard } {
  const theyOwe = new Map<CurrencyCode, number>();
  const iOwe = new Map<CurrencyCode, number>();
  const rows: Extract<AnswerCard, { type: "balances" }>["rows"] = [];
  let missing = 0;
  for (const group of snapshot.groups) {
    const memberId = memberByGroup.get(group.id);
    if (!memberId || group.archived) continue;
    if (!group.balances) {
      missing++;
      continue;
    }
    for (const [currency, net] of pairwiseBalance(group, memberId)) {
      if (net > 0) addTo(theyOwe, currency, net);
      else addTo(iOwe, currency, -net);
      rows.push({
        label: groupLabel(group),
        amountMinor: Math.abs(net),
        currency,
        sub: net > 0 ? `${personLabel} owes you` : `you owe ${personLabel}`,
      });
    }
  }
  // Same name in several groups is only the same person when it is the same
  // account; otherwise list each group and never add them up.
  const accounts = new Set(
    [...memberByGroup.entries()].map(([groupId, memberId]) =>
      snapshot.groups.find((g) => g.id === groupId)?.members.find((m) => m.id === memberId)?.userId ?? `member:${memberId}`,
    ),
  );
  const samePerson = accounts.size <= 1;
  let text: string;
  if (rows.length === 0) text = `You and ${personLabel} are settled up.`;
  else if (!samePerson) {
    text = `There's a ${personLabel} in ${memberByGroup.size} of your groups, and they may not be the same person, so here is each group separately.`;
  } else {
    const parts: string[] = [];
    if (theyOwe.size) parts.push(`${personLabel} owes you ${moneyList(theyOwe)}`);
    if (iOwe.size) parts.push(`you owe ${personLabel} ${moneyList(iOwe)}`);
    text = `${parts.join(", and ")}${rows.length > 1 ? " across your groups" : ""}.`;
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }
  if (missing > 0) text += ` (${missing} group${missing === 1 ? "" : "s"} not loaded yet.)`;
  return { text, card: { type: "balances", title: samePerson ? `You and ${personLabel}` : `People named ${personLabel}`, rows } };
}

export function groupBalances(group: SnapshotGroup): { text: string; card: AnswerCard } {
  if (!group.balances) {
    return { text: `${groupLabel(group)}'s balances haven't loaded yet. Open the group once while online.`, card: { type: "balances", title: groupLabel(group), rows: [] } };
  }
  const names = new Map(group.members.map((m) => [m.id, m.isMe ? "You" : m.name]));
  const rows = group.balances.flatMap((b) =>
    b.net
      .filter((n) => n.amountMinor !== 0)
      .map((n) => ({
        label: names.get(n.memberId) ?? "Someone",
        amountMinor: Math.abs(n.amountMinor),
        currency: b.currency,
        sub: n.amountMinor > 0 ? "is owed" : "owes",
      })),
  );
  return {
    text: rows.length ? `Here's where ${groupLabel(group)} stands.` : `${groupLabel(group)} is settled up.`,
    card: { type: "balances", title: groupLabel(group), rows },
  };
}

export type ExpenseScope = { groups: SnapshotGroup[]; range: DateRange | null; search: string | null; memberIdByGroup?: Map<string, string> };

export function scopedExpenses(scope: ExpenseScope): { expense: SnapshotExpense; group: SnapshotGroup }[] {
  const needle = scope.search?.toLowerCase().trim() ?? "";
  const out: { expense: SnapshotExpense; group: SnapshotGroup }[] = [];
  for (const group of scope.groups) {
    for (const expense of group.expenses ?? []) {
      if (!inRange(expense.date, scope.range)) continue;
      if (needle && !expense.description.toLowerCase().includes(needle)) continue;
      const memberId = scope.memberIdByGroup?.get(group.id);
      if (memberId && !expense.shares.some((s) => s.memberId === memberId) && !expense.payers.some((p) => p.memberId === memberId)) continue;
      out.push({ expense, group });
    }
  }
  return out.sort((a, b) => (a.expense.date === b.expense.date ? b.expense.createdAt.localeCompare(a.expense.createdAt) : b.expense.date.localeCompare(a.expense.date)));
}

export function expenseRows(items: { expense: SnapshotExpense; group: SnapshotGroup }[], max = 8): Extract<AnswerCard, { type: "expenses" }>["rows"] {
  return items.slice(0, max).map(({ expense, group }) => ({
    expenseId: expense.id,
    groupId: group.id,
    label: expense.description,
    sub: `${groupLabel(group)} · ${expense.date}${expense.pending ? " · not synced yet" : ""}`,
    amountMinor: expense.amountMinor,
    currency: expense.currency,
  }));
}

export function spendingTotals(items: { expense: SnapshotExpense }[]): Map<CurrencyCode, number> {
  const totals = new Map<CurrencyCode, number>();
  for (const { expense } of items) addTo(totals, expense.currency, expense.amountMinor);
  return totals;
}

/** Who paid the most, per currency (the group's money actually put in). */
export function topPayers(group: SnapshotGroup, items: { expense: SnapshotExpense }[]): Extract<AnswerCard, { type: "totals" }>["rows"] {
  const paid = new Map<string, number>();
  for (const { expense } of items) {
    for (const payer of expense.payers) {
      const key = `${payer.memberId}|${expense.currency}`;
      paid.set(key, (paid.get(key) ?? 0) + payer.amountMinor);
    }
  }
  const names = new Map(group.members.map((m) => [m.id, m.isMe ? "You" : m.name]));
  return [...paid.entries()]
    .map(([key, amountMinor]) => {
      const [memberId, currency] = key.split("|") as [string, CurrencyCode];
      return { label: names.get(memberId) ?? "Someone", amountMinor, currency };
    })
    .sort((a, b) => b.amountMinor - a.amountMinor);
}
