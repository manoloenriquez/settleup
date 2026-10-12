import { z } from "zod";
import { CATEGORY_SLUGS } from "../utils/category";
import { currencyCodeSchema } from "../utils/currency";
import { isISODate, monthOf } from "./dates";
import { MAX_BUDGET_MINOR, RATE_PATTERN, parseRate } from "./money";

// ---------------------------------------------------------------------------
// The budget document: one per owner (the guest on this phone, or an account).
// It holds configuration and the person's own notes about spending — never
// computed totals. Every figure the app shows is recomputed from this plus the
// transactions (see engine.ts), so an edited or deleted expense can never
// leave a stale number behind.
//
// The document syncs as a whole for signed-in users. Sync bookkeeping lives in
// the device store envelope (budgetStoreSchema), never in the document, so one
// device can never adopt another device's local state.
// ---------------------------------------------------------------------------

const isoDate = z.string().refine(isISODate, "Choose a valid date.");
const isoDateTime = z.iso.datetime({ offset: true });
const minor = z.number().int().min(0).max(MAX_BUDGET_MINOR);
const positiveMinor = z.number().int().min(1).max(MAX_BUDGET_MINOR);
const category = z.enum(CATEGORY_SLUGS);

export const recoverySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("full") }),
  z.object({ mode: z.literal("smoothed"), weeks: z.number().int().min(2).max(8) }),
]);

export const fixedCostSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(60),
  amountMinor: positiveMinor,
  category,
  dueDay: z.number().int().min(1).max(31).nullable(),
});

export const exchangeRateSchema = z.object({
  currency: currencyCodeSchema,
  /** Units of the budget currency per one unit of `currency`, e.g. "56.25". */
  rate: z
    .string()
    .regex(RATE_PATTERN, "Use a number like 56.25")
    .refine((rate) => parseRate(rate) !== null, "A rate must be more than zero."),
  effectiveFrom: isoDate,
});

export const budgetConfigSchema = z
  .object({
    currency: currencyCodeSchema,
    /** The monthly ceiling: everything counted in the month. */
    monthlyLimitMinor: minor,
    /** The flexible weekly allowance before rollover. */
    weeklyTargetMinor: minor,
    /** Relative weight per weekday, Sunday first; null = the same every day. */
    dayWeights: z.array(z.number().int().min(0).max(1000)).length(7).nullable(),
    /** 0 = Sunday … 6 = Saturday. */
    weekStartsOn: z.number().int().min(0).max(6),
    recovery: recoverySchema,
    /** What happens to spending above the monthly limit when the month ends. */
    monthEnd: z.enum(["carry_overspend", "fresh_start"]),
    /** Categories that count toward the month but not the weekly allowance. */
    outsideWeekly: z.array(category),
    categoryLimits: z.array(z.object({ category, limitMinor: minor })),
    fixedCosts: z.array(fixedCostSchema).max(50),
    rates: z.array(exchangeRateSchema).max(100),
  })
  .superRefine((config, ctx) => {
    if (config.dayWeights && config.dayWeights.reduce((a, b) => a + b, 0) <= 0) {
      ctx.addIssue({ code: "custom", path: ["dayWeights"], message: "At least one day needs an allowance." });
    }
    if (new Set(config.outsideWeekly).size !== config.outsideWeekly.length) {
      ctx.addIssue({ code: "custom", path: ["outsideWeekly"], message: "A category is listed twice." });
    }
    if (new Set(config.categoryLimits.map((l) => l.category)).size !== config.categoryLimits.length) {
      ctx.addIssue({ code: "custom", path: ["categoryLimits"], message: "A category has two limits." });
    }
    if (new Set(config.fixedCosts.map((f) => f.id)).size !== config.fixedCosts.length) {
      ctx.addIssue({ code: "custom", path: ["fixedCosts"], message: "Two fixed costs share an id." });
    }
    const rateKeys = config.rates.map((r) => `${r.currency}|${r.effectiveFrom}`);
    if (new Set(rateKeys).size !== rateKeys.length) {
      ctx.addIssue({ code: "custom", path: ["rates"], message: "Two rates for the same currency and date." });
    }
    if (config.rates.some((r) => r.currency === config.currency)) {
      ctx.addIssue({ code: "custom", path: ["rates"], message: "The budget currency needs no rate." });
    }
  });

export const planSourceSchema = z.enum(["setup", "manual", "assistant", "import", "undo"]);

export const budgetPlanVersionSchema = z.object({
  id: z.uuid(),
  /** First day this version governs (a week-segment start). */
  effectiveFrom: isoDate,
  createdAt: isoDateTime,
  source: planSourceSchema,
  /** "Weekly allowance ₱7,000 → ₱8,000" */
  summary: z.string().max(200),
  config: budgetConfigSchema,
});

/** "personal:<uuid>" or "group:<uuid>": one transaction, whatever its source. */
export const spendRefSchema = z.string().regex(/^(personal|group):[0-9a-f-]{36}$/i);

const annotationBase = {
  id: z.uuid(),
  createdAt: isoDateTime,
  /** Tombstone, so removing a note syncs like adding one. */
  deletedAt: isoDateTime.nullable(),
};

export const budgetAnnotationSchema = z.discriminatedUnion("kind", [
  /** "Don't count this": a card bill for purchases already logged, a transfer. */
  z.object({ ...annotationBase, kind: z.literal("exclude"), ref: spendRefSchema }),
  /** Count this toward a fixed cost or a planned expense instead of the week. */
  z.object({
    ...annotationBase,
    kind: z.literal("link"),
    ref: spendRefSchema,
    target: z.string().regex(/^(fixed|planned):[0-9a-f-]{36}$/i),
  }),
  /** Money that came back: counts as negative spending on its date. */
  z.object({
    ...annotationBase,
    kind: z.literal("refund"),
    date: isoDate,
    amountMinor: positiveMinor,
    category,
    note: z.string().trim().min(1).max(120),
    ref: spendRefSchema.nullable(),
  }),
  /** Upcoming spending set aside: a purchase (one day) or a trip (every expense in the dates). */
  z
    .object({
      ...annotationBase,
      kind: z.literal("planned"),
      name: z.string().trim().min(1).max(60),
      amountMinor: positiveMinor,
      from: isoDate,
      to: isoDate,
      coversAllSpending: z.boolean(),
      category: category.nullable(),
    })
    .refine((p) => p.from <= p.to && monthOf(p.from) === monthOf(p.to), {
      message: "Planned spending must start and end in the same month.",
    }),
  /** Moves allowance between weeks of one month; the deltas add up to zero. */
  z
    .object({
      ...annotationBase,
      kind: z.literal("reallocation"),
      note: z.string().trim().min(1).max(120),
      deltas: z
        .array(z.object({ segmentStart: isoDate, deltaMinor: z.number().int().min(-MAX_BUDGET_MINOR).max(MAX_BUDGET_MINOR) }))
        .min(2)
        .max(6),
    })
    .refine((r) => r.deltas.reduce((a, d) => a + d.deltaMinor, 0) === 0, { message: "A reallocation must add up to zero." })
    .refine((r) => new Set(r.deltas.map((d) => monthOf(d.segmentStart))).size === 1, {
      message: "A reallocation stays inside one month.",
    }),
]);

export const budgetDocumentSchema = z.object({
  version: z.literal(1),
  id: z.uuid(),
  createdAt: isoDateTime,
  /** The weekly ledger starts with the week segment containing this date. */
  startDate: isoDate,
  plans: z.array(budgetPlanVersionSchema).min(1).max(500),
  annotations: z.array(budgetAnnotationSchema).max(2000),
  /** Budget turned off. Kept (not erased) so the change syncs. */
  deletedAt: isoDateTime.nullable(),
});

/**
 * What the device stores. `base` is the last document the server
 * acknowledged; a conflict merges local changes since `base` onto the
 * server's copy (merge.ts).
 */
export const budgetStoreSchema = z.object({
  version: z.literal(1),
  doc: budgetDocumentSchema.nullable(),
  base: budgetDocumentSchema.nullable(),
  /** local = guest (never syncs), pending = changed since the server acknowledged, synced. */
  sync: z.enum(["local", "pending", "synced"]),
  serverUpdatedAt: isoDateTime.nullable(),
});
