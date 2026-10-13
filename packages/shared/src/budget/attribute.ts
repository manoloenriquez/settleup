import type { CurrencyCode } from "../utils/currency";
import { inferCategorySlug, isCategorySlug, type CategorySlug } from "../utils/category";
import { monthOf, type ISODate } from "./dates";
import { convertMinor } from "./money";
import { liveAnnotations, versionAt } from "./plan";
import type { BudgetConfig, BudgetDocument, BudgetItem, Bucket, PlannedSpend, SpendSource } from "./types";

// ---------------------------------------------------------------------------
// Attribution: which transactions count, how much, and toward what.
//
// - A personal expense counts in full; a group expense counts as the person's
//   own share (paying for others is lending, not spending). Settlements are
//   never passed in: they move a debt that was already counted as shares.
// - Each transaction is keyed by its ref, so it can be counted only once, and
//   lands in exactly one bucket, by this precedence:
//     excluded → explicit link → planned trip (its dates) → fixed cost (name)
//     → planned purchase (name) → category outside the weekly budget → weekly.
// - Another currency counts only with a rate effective on the expense date.
// ---------------------------------------------------------------------------

function normalizeWords(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
}

/** Whole-word match: "Rent" matches "October rent", not "Parent". */
export function nameMatches(description: string, name: string): boolean {
  const needle = normalizeWords(name);
  return needle.trim().length > 0 && normalizeWords(description).includes(needle);
}

/** The rate for `currency` effective on `date`: the latest entry on or before it. None before the first. */
export function rateFor(config: BudgetConfig, currency: CurrencyCode, date: ISODate): string | null {
  const applicable = config.rates
    .filter((r) => r.currency === currency && r.effectiveFrom <= date)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return applicable.at(-1)?.rate ?? null;
}

type Rules = {
  excluded: Set<string>;
  links: Map<string, string>;
  planned: PlannedSpend[];
};

function rulesOf(doc: BudgetDocument): Rules {
  const live = liveAnnotations(doc);
  const excluded = new Set<string>();
  const links = new Map<string, { target: string; id: string }>();
  for (const a of live) {
    if (a.kind === "exclude") excluded.add(a.ref);
    // Two devices could each link the same expense; the smaller id wins, everywhere.
    if (a.kind === "link") {
      const current = links.get(a.ref);
      if (!current || a.id < current.id) links.set(a.ref, { target: a.target, id: a.id });
    }
  }
  const planned = live.filter((a): a is PlannedSpend => a.kind === "planned").sort((a, b) => a.id.localeCompare(b.id));
  return { excluded, links: new Map([...links].map(([ref, v]) => [ref, v.target])), planned };
}

function bucketFor(
  source: { ref: string | null; description: string; category: BudgetItem["category"]; date: ISODate; isRefund: boolean },
  config: BudgetConfig,
  rules: Rules,
): { bucket: Bucket; reason: BudgetItem["reason"] } {
  const month = monthOf(source.date);
  const linked = source.ref ? rules.links.get(source.ref) : undefined;
  if (linked) {
    const [kind, id] = linked.split(":") as ["fixed" | "planned", string];
    if (kind === "fixed") {
      const fixed = config.fixedCosts.find((f) => f.id === id);
      if (fixed) return { bucket: { kind: "fixed", id, name: fixed.name }, reason: "linked" };
    } else {
      const plan = rules.planned.find((p) => p.id === id);
      if (plan) return { bucket: { kind: "planned", id, name: plan.name }, reason: "linked" };
    }
    // A link to something that no longer exists falls through to the normal rules.
  }
  const trip = rules.planned.find((p) => p.coversAllSpending && p.from <= source.date && source.date <= p.to);
  if (trip) return { bucket: { kind: "planned", id: trip.id, name: trip.name }, reason: "trip" };
  if (!source.isRefund) {
    const fixed = config.fixedCosts.find((f) => nameMatches(source.description, f.name));
    if (fixed) return { bucket: { kind: "fixed", id: fixed.id, name: fixed.name }, reason: "name" };
    const purchase = rules.planned.find(
      (p) => !p.coversAllSpending && monthOf(p.from) === month && nameMatches(source.description, p.name),
    );
    if (purchase) return { bucket: { kind: "planned", id: purchase.id, name: purchase.name }, reason: "name" };
  }
  if (config.outsideWeekly.includes(source.category)) return { bucket: { kind: "outside" }, reason: "outside_category" };
  return { bucket: { kind: "weekly" }, reason: "weekly" };
}

/**
 * Every transaction and refund from `from` to `to`, valued in the budget
 * currency and assigned a bucket. Sources with the same ref are counted once.
 */
export function attributeSpending(
  doc: BudgetDocument,
  sources: readonly SpendSource[],
  from: ISODate,
  to: ISODate,
  budgetCurrency: CurrencyCode,
): BudgetItem[] {
  const rules = rulesOf(doc);
  // One record per ref. Callers pass each record once; if a ref still arrives
  // twice, the choice must not depend on input order.
  const unique = new Map<string, SpendSource>();
  for (const source of sources) {
    const existing = unique.get(source.ref);
    if (!existing || JSON.stringify(source) > JSON.stringify(existing)) unique.set(source.ref, source);
  }
  const items: BudgetItem[] = [];

  for (const source of unique.values()) {
    if (source.date < from || source.date > to) continue;
    if (!Number.isSafeInteger(source.amountMinor) || source.amountMinor <= 0) continue;
    const config = versionAt(doc, source.date).config;
    const base = {
      ref: source.ref,
      kind: source.kind,
      description: source.description,
      date: source.date,
      category: source.category,
      originalMinor: source.amountMinor,
      originalCurrency: source.currency,
      ...(source.groupName ? { groupName: source.groupName } : {}),
    };
    if (rules.excluded.has(source.ref)) {
      items.push({ ...base, amountMinor: 0, rate: null, bucket: { kind: "weekly" }, status: "excluded", reason: "excluded" });
      continue;
    }
    let amount = source.amountMinor;
    let rate: string | null = null;
    if (source.currency !== budgetCurrency) {
      rate = rateFor(config, source.currency, source.date);
      const converted = rate ? convertMinor(source.amountMinor, source.currency, budgetCurrency, rate) : null;
      if (converted === null) {
        items.push({
          ...base,
          amountMinor: 0,
          rate,
          bucket: { kind: "weekly" },
          status: rate ? "out_of_range" : "no_rate",
          reason: rate ? "out_of_range" : "no_rate",
        });
        continue;
      }
      amount = converted;
    }
    const { bucket, reason } = bucketFor({ ...source, isRefund: false }, config, rules);
    items.push({ ...base, amountMinor: amount, rate, bucket, status: "counted", reason });
  }

  for (const refund of liveAnnotations(doc)) {
    if (refund.kind !== "refund" || refund.date < from || refund.date > to) continue;
    const config = versionAt(doc, refund.date).config;
    const { bucket, reason } = bucketFor(
      { ref: refund.ref, description: refund.note, category: refund.category, date: refund.date, isRefund: true },
      config,
      rules,
    );
    items.push({
      ref: `refund:${refund.id}`,
      kind: "refund",
      description: refund.note,
      date: refund.date,
      category: refund.category,
      originalMinor: -refund.amountMinor,
      originalCurrency: budgetCurrency,
      amountMinor: -refund.amountMinor,
      rate: null,
      bucket,
      status: "counted",
      reason,
    });
  }

  return items.sort((a, b) => (a.date === b.date ? a.ref.localeCompare(b.ref) : a.date.localeCompare(b.date)));
}

export function isCounted(item: BudgetItem): boolean {
  return item.status === "counted";
}

// ---------------------------------------------------------------------------
// Turning stored records into budget sources.
// ---------------------------------------------------------------------------

export type GroupShareRow = {
  expenseId: string;
  groupName: string;
  description: string;
  currency: CurrencyCode;
  date: ISODate;
  totalMinor: number;
  /** Category of the group expense: its slug and name (group categories can be custom). */
  categorySlug: string | null;
  categoryName: string | null;
  shares: { memberId: string; shareMinor: number }[];
};

/**
 * The person's own cost of each group expense: the sum of their members'
 * shares (normally one member per group). Paying for others is not spending,
 * so an expense they paid but don't share gives nothing.
 */
export function groupSharesToSources(rows: readonly GroupShareRow[], myMemberIds: ReadonlySet<string>): SpendSource[] {
  const out: SpendSource[] = [];
  for (const row of rows) {
    const mine = row.shares.filter((s) => myMemberIds.has(s.memberId)).reduce((sum, s) => sum + s.shareMinor, 0);
    if (mine <= 0) continue;
    out.push({
      ref: `group:${row.expenseId}`,
      kind: "group",
      description: row.description,
      amountMinor: mine,
      currency: row.currency,
      category: budgetCategory(row.categorySlug, row.categoryName, row.description),
      date: row.date,
      groupName: row.groupName,
      totalMinor: row.totalMinor,
    });
  }
  return out;
}

/** One of the nine shared slugs: the group category's own slug, else inferred from its name or the description. */
export function budgetCategory(slug: string | null, name: string | null, description: string): CategorySlug {
  if (isCategorySlug(slug)) return slug;
  return inferCategorySlug(name) ?? inferCategorySlug(description) ?? "other";
}

export function personalToSource(expense: {
  id: string;
  description: string;
  amountMinor: number;
  currency: CurrencyCode;
  category: CategorySlug;
  date: ISODate;
  deletedAt: string | null;
}): SpendSource | null {
  if (expense.deletedAt) return null;
  return {
    ref: `personal:${expense.id}`,
    kind: "personal",
    description: expense.description,
    amountMinor: expense.amountMinor,
    currency: expense.currency,
    category: expense.category,
    date: expense.date,
  };
}
