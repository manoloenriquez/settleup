import type { CurrencyCode } from "../utils/currency";
import { budgetConfigSchema, budgetDocumentSchema, budgetAnnotationSchema } from "./schema";
import { maxDate, monthEnd, monthOf, monthStart, minDate, segmentsOfMonth, type ISODate, type MonthKey, type Segment } from "./dates";
import type { BudgetAnnotation, BudgetConfig, BudgetDocument, BudgetPlanVersion } from "./types";

// ---------------------------------------------------------------------------
// Which settings apply when, and the only ways a budget document changes.
// Plans are append-only: a change adds a version that governs from the start
// of the current week, so weeks that already happened keep the settings they
// ran under and their history never moves.
// ---------------------------------------------------------------------------

export function defaultBudgetConfig(currency: CurrencyCode): BudgetConfig {
  return {
    currency,
    monthlyLimitMinor: 0,
    weeklyTargetMinor: 0,
    dayWeights: null,
    weekStartsOn: 1,
    recovery: { mode: "full" },
    monthEnd: "carry_overspend",
    outsideWeekly: [],
    categoryLimits: [],
    fixedCosts: [],
    rates: [],
  };
}

function newer(a: BudgetPlanVersion, b: BudgetPlanVersion): boolean {
  if (a.effectiveFrom !== b.effectiveFrom) return a.effectiveFrom > b.effectiveFrom;
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt;
  return a.id > b.id;
}

/** The version governing `date`: the latest one effective on or before it (else the first). */
export function versionAt(doc: BudgetDocument, date: ISODate): BudgetPlanVersion {
  let best: BudgetPlanVersion | null = null;
  let earliest: BudgetPlanVersion | null = null;
  for (const plan of doc.plans) {
    if (!earliest || newer(earliest, plan)) earliest = plan;
    if (plan.effectiveFrom <= date && (!best || newer(plan, best))) best = plan;
  }
  const chosen = best ?? earliest;
  if (!chosen) throw new Error("A budget needs at least one plan.");
  return chosen;
}

/** Month-level settings (limit, fixed costs, category limits, month-end policy). */
export function monthVersion(doc: BudgetDocument, month: MonthKey, today: ISODate): BudgetPlanVersion {
  return versionAt(doc, minDate(monthEnd(month), maxDate(today, monthStart(month))));
}

/**
 * Week boundaries for a month come from the settings in force on its first
 * day, so changing the week start takes effect next month and never redraws
 * weeks that already happened.
 */
export function weekStartsOnFor(doc: BudgetDocument, month: MonthKey): number {
  return versionAt(doc, monthStart(month)).config.weekStartsOn;
}

export function segmentContaining(doc: BudgetDocument, date: ISODate): Segment {
  const month = monthOf(date);
  const segment = segmentsOfMonth(month, weekStartsOnFor(doc, month)).find((s) => s.start <= date && date <= s.end);
  if (!segment) throw new Error("Date outside its month.");
  return segment;
}

/** Where a change made today takes effect: the start of this week (never before the budget starts). */
export function changeEffectiveFrom(doc: BudgetDocument, today: ISODate): ISODate {
  const start = segmentContaining(doc, doc.startDate).start;
  return maxDate(segmentContaining(doc, today).start, start);
}

/** Short fingerprint of a document's content: a preview made from one revision can't be applied to another. */
export function budgetRevision(doc: BudgetDocument | null): string {
  if (!doc) return "none";
  const text = [
    doc.id,
    doc.deletedAt ?? "",
    doc.startDate,
    ...doc.plans.map((p) => p.id).sort(),
    ...doc.annotations.map((a) => `${a.id}:${a.deletedAt ?? ""}`).sort(),
  ].join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${doc.plans.length}.${doc.annotations.length}.${hash.toString(36)}`;
}

/** A budget's currency is fixed when it is created. */
export function budgetCurrency(doc: BudgetDocument): CurrencyCode {
  const first = [...doc.plans].sort((a, b) => (newer(a, b) ? 1 : -1))[0];
  if (!first) throw new Error("A budget needs at least one plan.");
  return first.config.currency;
}

export function liveAnnotations(doc: BudgetDocument): BudgetAnnotation[] {
  return doc.annotations.filter((a) => a.deletedAt === null);
}

export type PlanMeta = {
  planId: string;
  now: string;
  source: BudgetPlanVersion["source"];
  summary: string;
  /** A later start than this week (e.g. next month's first day); never earlier. */
  effectiveFrom?: ISODate;
};

export function createBudgetDocument(params: {
  id: string;
  config: BudgetConfig;
  startDate: ISODate;
  meta: PlanMeta;
}): BudgetDocument {
  const config = budgetConfigSchema.parse(params.config);
  // Weeks are drawn from the start date's month, so the first plan governs from the 1st.
  return budgetDocumentSchema.parse({
    version: 1,
    id: params.id,
    createdAt: params.meta.now,
    startDate: params.startDate,
    plans: [
      {
        id: params.meta.planId,
        effectiveFrom: monthStart(monthOf(params.startDate)),
        createdAt: params.meta.now,
        source: params.meta.source,
        summary: params.meta.summary,
        config,
      },
    ],
    annotations: [],
    deletedAt: null,
  });
}

export function withConfigChange(doc: BudgetDocument, config: BudgetConfig, today: ISODate, meta: PlanMeta): BudgetDocument {
  const parsed = budgetConfigSchema.parse(config);
  if (parsed.currency !== budgetCurrency(doc)) {
    throw new Error("A budget keeps its currency. Turn it off and set up a new one to change it.");
  }
  const earliest = changeEffectiveFrom(doc, today);
  const effectiveFrom = meta.effectiveFrom && meta.effectiveFrom > earliest ? meta.effectiveFrom : earliest;
  return budgetDocumentSchema.parse({
    ...doc,
    plans: [
      ...doc.plans,
      {
        id: meta.planId,
        effectiveFrom,
        createdAt: laterThanAll(doc, effectiveFrom, meta.now),
        source: meta.source,
        summary: meta.summary,
        config: parsed,
      },
    ],
  });
}

/**
 * A new version must govern from its date even if this device's clock is
 * behind the one that wrote an earlier version for the same date.
 */
function laterThanAll(doc: BudgetDocument, effectiveFrom: ISODate, now: string): string {
  const latest = doc.plans
    .filter((p) => p.effectiveFrom === effectiveFrom)
    .reduce((max, p) => (p.createdAt > max ? p.createdAt : max), "");
  if (!latest || now > latest) return now;
  return new Date(Date.parse(latest) + 1).toISOString();
}

export function withAnnotation(doc: BudgetDocument, annotation: BudgetAnnotation): BudgetDocument {
  const parsed = budgetAnnotationSchema.parse(annotation);
  if (doc.annotations.some((a) => a.id === parsed.id)) throw new Error("That note already exists.");
  // One live link or exclusion per transaction: a new one replaces the old.
  const replaces = (a: BudgetAnnotation): boolean =>
    a.deletedAt === null &&
    "ref" in a &&
    "ref" in parsed &&
    a.ref !== null &&
    a.ref === parsed.ref &&
    (a.kind === "link" || a.kind === "exclude") &&
    (parsed.kind === "link" || parsed.kind === "exclude");
  return budgetDocumentSchema.parse({
    ...doc,
    annotations: [...doc.annotations.map((a) => (replaces(a) ? { ...a, deletedAt: parsed.createdAt } : a)), parsed],
  });
}

export function withoutAnnotation(doc: BudgetDocument, id: string, now: string): BudgetDocument {
  if (!doc.annotations.some((a) => a.id === id)) throw new Error("That note no longer exists.");
  return {
    ...doc,
    annotations: doc.annotations.map((a) => (a.id === id && a.deletedAt === null ? { ...a, deletedAt: now } : a)),
  };
}

export function turnedOff(doc: BudgetDocument, now: string): BudgetDocument {
  return { ...doc, deletedAt: doc.deletedAt ?? now };
}

/**
 * Turning a budget back on starts the weekly ledger again from today with the
 * given settings; the earlier plans stay in the history.
 */
export function turnedOn(doc: BudgetDocument, config: BudgetConfig, today: ISODate, meta: PlanMeta): BudgetDocument {
  const restarted: BudgetDocument = { ...doc, deletedAt: null, startDate: today };
  return withConfigChange(restarted, config, today, meta);
}
