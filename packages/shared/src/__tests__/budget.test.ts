import { describe, expect, it } from "vitest";
import {
  affordability,
  allocateByWeights,
  computeBudget,
  convertMinor,
  createBudgetDocument,
  dayAllocations,
  daysInMonth,
  defaultBudgetConfig,
  explainWeek,
  groupSharesToSources,
  mergeBudgetDocuments,
  monthEnd,
  parseRate,
  previewNewBudget,
  recoveryPlan,
  segmentsOfMonth,
  storeAfterSave,
  storeWithLocalChange,
  storeWithServerCopy,
  emptyBudgetStore,
  suggestDayWeights,
  suggestWeeklyTarget,
  withAnnotation,
  withConfigChange,
  withoutAnnotation,
  type BudgetConfig,
  type BudgetDocument,
  type BudgetState,
  type SpendSource,
} from "../budget";

// ---------------------------------------------------------------------------
// Fixtures. February 2027 runs Monday 1 → Sunday 28: four whole Monday weeks,
// so the brief's week-by-week examples map onto it exactly. ₱ amounts are
// written in pesos and stored in centavos.
// ---------------------------------------------------------------------------

const P = (pesos: number): number => Math.round(pesos * 100);
let counter = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
const NOW = "2027-01-01T00:00:00.000Z";

function config(over: Partial<BudgetConfig> = {}): BudgetConfig {
  return { ...defaultBudgetConfig("PHP"), monthlyLimitMinor: P(100_000), weeklyTargetMinor: P(7_000), ...over };
}

function budget(over: Partial<BudgetConfig> = {}, startDate = "2027-02-01"): BudgetDocument {
  return createBudgetDocument({ id: uuid(), config: config(over), startDate, meta: { planId: uuid(), now: NOW, source: "setup", summary: "Set up" } });
}

function spend(date: string, pesos: number, over: Partial<SpendSource> = {}): SpendSource {
  return {
    ref: `personal:${uuid()}`,
    kind: "personal",
    description: "Spending",
    amountMinor: P(pesos),
    currency: "PHP",
    category: "food-drinks",
    date,
    ...over,
  };
}

type Active = Extract<BudgetState, { status: "active" }>;
function active(doc: BudgetDocument, today: string, sources: SpendSource[] = []): Active {
  const state = computeBudget({ doc, today, sources });
  if (state.status !== "active") throw new Error(`expected an active budget, got ${state.status}`);
  return state;
}

function allowances(state: Active): number[] {
  return state.months.at(-1)!.segments.map((s) => s.allowanceMinor);
}

// ---------------------------------------------------------------------------

describe("budget periods", () => {
  it("splits weeks at month boundaries for every week start", () => {
    for (const month of ["2026-10", "2027-02", "2028-02", "2026-12", "2027-03"]) {
      for (let start = 0; start < 7; start++) {
        const segments = segmentsOfMonth(month, start);
        expect(segments.reduce((sum, s) => sum + s.days, 0)).toBe(daysInMonth(month));
        expect(segments[0]!.start).toBe(`${month}-01`);
        expect(segments.at(-1)!.end).toBe(monthEnd(month));
        for (const s of segments) expect(s.days).toBeLessThanOrEqual(7);
        expect(segments.length).toBeGreaterThanOrEqual(4);
        expect(segments.length).toBeLessThanOrEqual(6);
      }
    }
  });

  it("handles leap years", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2027-02")).toBe(28);
    const state = active(budget({}, "2028-02-01"), "2028-02-29", [spend("2028-02-29", 100)]);
    expect(state.live.spentTodayMinor).toBe(P(100));
  });

  it("spreads the weekly target over days and always adds up exactly", () => {
    expect(dayAllocations(config({ weeklyTargetMinor: P(7_000) }))).toEqual(new Array(7).fill(P(1_000)));
    const odd = dayAllocations(config({ weeklyTargetMinor: 1_000 }));
    expect(odd.reduce((a, b) => a + b, 0)).toBe(1_000);
    const weekend = dayAllocations(config({ weeklyTargetMinor: P(7_000), dayWeights: [3, 2, 2, 2, 2, 3, 3] }));
    expect(weekend.reduce((a, b) => a + b, 0)).toBe(P(7_000));
    expect(weekend[6]).toBeGreaterThan(weekend[2]!);
    expect(allocateByWeights(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });
});

describe("adaptive weekly allowance — the brief's scenarios", () => {
  it("A: underspending ₱2,000 makes next week ₱9,000", () => {
    const doc = budget();
    const state = active(doc, "2027-02-08", [spend("2027-02-03", 5_000)]);
    expect(state.live.segment.allowanceMinor).toBe(P(9_000));
    expect(state.live.segment.surplusMinor).toBe(P(2_000));
  });

  it("B: overspending ₱2,000 makes next week ₱5,000", () => {
    const state = active(budget(), "2027-02-08", [spend("2027-02-03", 9_000)]);
    expect(state.live.segment.allowanceMinor).toBe(P(5_000));
    expect(state.live.segment.repaymentMinor).toBe(P(2_000));
  });

  it("C: consecutive variances give 7,000 / 9,000 / 5,000 / 8,000, then back to 7,000", () => {
    const sources = [
      spend("2027-02-02", 5_000),
      spend("2027-02-09", 11_000),
      spend("2027-02-16", 4_000),
      spend("2027-02-23", 8_000),
    ];
    const doc = budget();
    const feb = active(doc, "2027-02-28", sources);
    expect(allowances(feb)).toEqual([P(7_000), P(9_000), P(5_000), P(8_000)]);
    expect(feb.months.at(-1)!.closingCarryMinor).toBe(0);
    const march = active(doc, "2027-03-01", sources);
    expect(march.live.segment.allowanceMinor).toBe(P(7_000));
  });

  it("D: a ₱9,000 deficit is kept even when next week's allowance is zero", () => {
    const sources = [spend("2027-02-02", 16_000)];
    const doc = budget();
    const week2 = active(doc, "2027-02-08", sources);
    expect(week2.live.segment.carryInMinor).toBe(P(-9_000));
    expect(week2.live.segment.theoreticalMinor).toBe(P(-2_000));
    expect(week2.live.segment.allowanceMinor).toBe(0);
    expect(week2.live.availableWeekMinor).toBe(0);
    expect(week2.live.safeTodayMinor).toBe(0);
    // Spending nothing in week 2 still leaves ₱2,000 to make up in week 3.
    const week3 = active(doc, "2027-02-15", sources);
    expect(week3.live.segment.carryInMinor).toBe(P(-2_000));
    expect(week3.live.segment.allowanceMinor).toBe(P(5_000));
  });

  it("E: with ₱54,000 of ₱60,000 spent, nothing offers more than ₱6,000", () => {
    const doc = budget({ monthlyLimitMinor: P(60_000), outsideWeekly: ["lodging"] });
    const sources = [spend("2027-02-01", 49_000, { category: "lodging" }), spend("2027-02-03", 5_000)];
    const state = active(doc, "2027-02-08", sources);
    expect(state.live.segment.theoreticalMinor).toBe(P(9_000));
    expect(state.live.segment.allowanceMinor).toBe(P(6_000));
    expect(state.live.availableWeekMinor).toBe(P(6_000));
    expect(state.live.availableMonthMinor).toBe(P(6_000));
    expect(state.live.safeTodayMinor).toBeLessThanOrEqual(P(6_000));
    const answer = affordability({ doc, today: "2027-02-08", sources }, P(7_000), "week");
    expect(answer?.verdict).toBe("over_month");
    // The cap does not create carry: the ledger still counts base − spent.
    expect(state.live.segment.carryInMinor).toBe(P(2_000));
  });

  it("F: a fixed cost is reserved, then counted once when paid", () => {
    const rentId = uuid();
    const doc = budget({
      monthlyLimitMinor: P(60_000),
      fixedCosts: [{ id: rentId, name: "Rent", amountMinor: P(20_000), category: "fees", dueDay: 5 }],
    });
    const before = active(doc, "2027-02-03", [spend("2027-02-02", 1_000)]);
    expect(before.live.reservedMinor).toBe(P(20_000));
    expect(before.live.availableMonthMinor).toBe(P(39_000));
    const paid = active(doc, "2027-02-06", [spend("2027-02-02", 1_000), spend("2027-02-05", 20_000, { description: "February rent", category: "fees" })]);
    expect(paid.live.reservedMinor).toBe(0);
    expect(paid.live.availableMonthMinor).toBe(P(39_000));
    expect(paid.months.at(-1)!.spentMinor).toBe(P(21_000));
    // Rent never touches the weekly allowance.
    expect(paid.live.spentWeekMinor).toBe(P(1_000));
  });

  it("G: a ₱4,000 dinner split equally counts ₱2,000", () => {
    const me = uuid();
    const friend = uuid();
    const rows = [
      {
        expenseId: uuid(),
        groupName: "Ana",
        description: "Dinner",
        currency: "PHP" as const,
        date: "2027-02-03",
        totalMinor: P(4_000),
        categorySlug: "food-drinks",
        categoryName: "Food & Drinks",
        shares: [
          { memberId: me, shareMinor: P(2_000) },
          { memberId: friend, shareMinor: P(2_000) },
        ],
      },
      // Paid for a friend, not shared: lending, not spending.
      {
        expenseId: uuid(),
        groupName: "Ana",
        description: "Her taxi",
        currency: "PHP" as const,
        date: "2027-02-03",
        totalMinor: P(500),
        categorySlug: null,
        categoryName: null,
        shares: [{ memberId: friend, shareMinor: P(500) }],
      },
    ];
    const sources = groupSharesToSources(rows, new Set([me]));
    expect(sources).toHaveLength(1);
    expect(sources[0]!.amountMinor).toBe(P(2_000));
    const state = active(budget(), "2027-02-04", sources);
    expect(state.live.spentWeekMinor).toBe(P(2_000));
  });

  it("H: editing an old expense recomputes every later week", () => {
    const doc = budget();
    const original = spend("2027-02-02", 5_000);
    expect(active(doc, "2027-02-15", [original]).live.segment.allowanceMinor).toBe(P(16_000));
    const week3Before = active(doc, "2027-02-15", [original]).live.segment;
    const edited = { ...original, amountMinor: P(6_000) };
    const week3After = active(doc, "2027-02-15", [edited]).live.segment;
    expect(week3After.carryInMinor).toBe(week3Before.carryInMinor - P(1_000));
    // Deleting it removes it everywhere.
    expect(active(doc, "2027-02-15", []).live.segment.carryInMinor).toBe(P(14_000));
  });

  it("I: weeks crossing a month are split, and each month reconciles on its own", () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    const doc = budget({ monthlyLimitMinor: P(40_000) }, "2026-10-01");
    const segs = active(doc, "2026-10-01").months[0]!.segments;
    expect(segs[0]).toMatchObject({ start: "2026-10-01", end: "2026-10-04", baseMinor: P(4_000) });
    expect(segs.at(-1)).toMatchObject({ start: "2026-10-26", end: "2026-10-31", baseMinor: P(6_000) });
    // Saturday 31 Oct counts in October; Sunday 1 Nov in November.
    const sources = [spend("2026-10-31", 1_000), spend("2026-11-01", 300)];
    const nov = active(doc, "2026-11-01", sources);
    expect(nov.months[0]!.spentMinor).toBe(P(1_000));
    expect(nov.months[1]!.spentMinor).toBe(P(300));
    expect(nov.live.segment).toMatchObject({ start: "2026-11-01", end: "2026-11-01", baseMinor: P(1_000) });
    // October's unspent allowance never inflates November.
    expect(nov.live.segment.surplusMinor).toBe(0);
    expect(nov.months[0]!.closingCarryMinor).toBeGreaterThan(0);
    expect(nov.savedMinor).toBe(nov.months[0]!.closingCarryMinor);
  });
});

describe("month end", () => {
  const over = [spend("2026-10-10", 45_000)];

  it("carries spending above the monthly limit into the next month", () => {
    const doc = budget({ monthlyLimitMinor: P(40_000) }, "2026-10-01");
    const nov = active(doc, "2026-11-02", over);
    expect(nov.months[0]!.overrunMinor).toBe(P(5_000));
    expect(nov.months[1]!.openingMinor).toBe(P(-5_000));
    expect(nov.months[1]!.effectiveLimitMinor).toBe(P(35_000));
    expect(nov.live.remainingMonthMinor).toBe(P(35_000));
    // Full rollover: the first November week (1 day) takes it all, then the next.
    const first = nov.months[1]!.segments[0]!;
    expect(first.carryInMinor).toBe(P(-5_000));
    expect(first.allowanceMinor).toBe(0);
  });

  it("starts fresh only when chosen, and history still shows the overrun", () => {
    const doc = budget({ monthlyLimitMinor: P(40_000), monthEnd: "fresh_start" }, "2026-10-01");
    const nov = active(doc, "2026-11-02", over);
    expect(nov.months[0]!.overrunMinor).toBe(P(5_000));
    expect(nov.months[1]!.openingMinor).toBe(0);
  });

  it("ends a weekly deficit that stayed within the limit with the month", () => {
    const doc = budget({ monthlyLimitMinor: P(100_000) }, "2026-10-26");
    const nov = active(doc, "2026-11-02", [spend("2026-10-30", 9_000)]);
    expect(nov.months[0]!.closingCarryMinor).toBeLessThan(0);
    expect(nov.months[0]!.overrunMinor).toBe(0);
    expect(nov.months[1]!.openingMinor).toBe(0);
  });
});

describe("smoothed recovery", () => {
  it("spreads a ₱3,000 overspend over three weeks", () => {
    const doc = budget({ recovery: { mode: "smoothed", weeks: 3 } });
    const sources = [spend("2027-02-02", 10_000), spend("2027-02-09", 6_000), spend("2027-02-16", 6_000)];
    const feb = active(doc, "2027-02-22", sources);
    expect(allowances(feb)).toEqual([P(7_000), P(6_000), P(6_000), P(6_000)]);
    expect(feb.live.segment.carryInMinor).toBe(P(-1_000));
  });

  it("lets underspending repay first, never deferring a deficit already paid", () => {
    const doc = budget({ recovery: { mode: "smoothed", weeks: 3 } });
    const feb = active(doc, "2027-02-15", [spend("2027-02-02", 10_000)]);
    // Week 2 spent nothing: the ₱3,000 is repaid and ₱4,000 is left over.
    expect(feb.live.segment.carryInMinor).toBe(P(4_000));
    expect(feb.live.segment.allowanceMinor).toBe(P(11_000));
  });

  it("makes the last week of the month take what is left and reports a shortfall", () => {
    const doc = budget({ recovery: { mode: "smoothed", weeks: 4 } });
    const feb = active(doc, "2027-02-22", [spend("2027-02-02", 7_000), spend("2027-02-09", 7_000), spend("2027-02-16", 20_000)]);
    const last = feb.live.segment;
    expect(last.repaymentMinor).toBe(P(13_000));
    expect(feb.warnings.some((w) => w.kind === "recovery_shortfall")).toBe(true);
  });

  it("reaches the same ledger balance as full rollover for the same spending", () => {
    const sources = [spend("2027-02-02", 12_000), spend("2027-02-10", 3_000), spend("2027-02-18", 9_000)];
    const full = active(budget(), "2027-02-28", sources);
    const smoothed = active(budget({ recovery: { mode: "smoothed", weeks: 3 } }), "2027-02-28", sources);
    expect(smoothed.months[0]!.closingCarryMinor).toBe(full.months[0]!.closingCarryMinor);
  });
});

describe("today and this week", () => {
  it("gives a day's share and keeps a day's leftover inside the week", () => {
    const doc = budget();
    expect(active(doc, "2027-02-01").live.safeTodayMinor).toBe(P(1_000));
    const monday = active(doc, "2027-02-01", [spend("2027-02-01", 300)]);
    expect(monday.live.safeTodayMinor).toBe(P(700));
    const tuesday = active(doc, "2027-02-02", [spend("2027-02-01", 300)]);
    // ₱6,700 over the six days left: no second weekly rollover, only inside the week.
    expect(tuesday.live.safeTodayMinor).toBe(Math.floor(P(6_700) / 6));
    expect(tuesday.live.availableWeekMinor).toBe(P(6_700));
  });

  it("gives more on weekend days with weekend weights", () => {
    const doc = budget({ dayWeights: [3, 2, 2, 2, 2, 3, 3] });
    const monday = active(doc, "2027-02-01").live.safeTodayMinor;
    const saturday = active(doc, "2027-02-06").live.safeTodayMinor;
    expect(saturday).toBeGreaterThan(monday);
  });

  it("explains each part of this week's allowance", () => {
    const state = active(budget(), "2027-02-08", [spend("2027-02-03", 5_000)]);
    const lines = explainWeek(state);
    expect(lines.map((l) => l.kind)).toEqual(["base", "surplus", "allowance"]);
    expect(lines.find((l) => l.kind === "surplus")!.amountMinor).toBe(P(2_000));
  });
});

describe("zero, refunds, exclusions and currencies", () => {
  it("handles a zero budget without negative availability", () => {
    const state = active(budget({ monthlyLimitMinor: 0, weeklyTargetMinor: 0 }), "2027-02-03", [spend("2027-02-02", 100)]);
    expect(state.live.safeTodayMinor).toBe(0);
    expect(state.live.availableWeekMinor).toBe(0);
    expect(state.live.availableMonthMinor).toBe(0);
    expect(state.warnings.some((w) => w.kind === "over_month")).toBe(true);
  });

  it("counts a refund as money back on its date", () => {
    const now = "2027-02-03T10:00:00.000Z";
    const doc = withAnnotation(budget(), {
      id: uuid(),
      kind: "refund",
      createdAt: now,
      deletedAt: null,
      date: "2027-02-03",
      amountMinor: P(500),
      category: "shopping",
      note: "Shoes returned",
      ref: null,
    });
    const state = active(doc, "2027-02-03", [spend("2027-02-02", 2_000)]);
    expect(state.live.spentWeekMinor).toBe(P(1_500));
  });

  it("excludes a record the person marks as not spending, and counts it again when undone", () => {
    const card = spend("2027-02-02", 8_000, { description: "Credit card bill" });
    const noteId = uuid();
    const excluded = withAnnotation(budget(), { id: noteId, kind: "exclude", createdAt: NOW, deletedAt: null, ref: card.ref });
    const state = active(excluded, "2027-02-03", [card]);
    expect(state.live.spentWeekMinor).toBe(0);
    expect(state.items[0]!.status).toBe("excluded");
    const restored = withoutAnnotation(excluded, noteId, NOW);
    expect(active(restored, "2027-02-03", [card]).live.spentWeekMinor).toBe(P(8_000));
  });

  it("converts other currencies only with a rate, exactly", () => {
    expect(parseRate("56.25")).toBe(BigInt(5_625_000_000));
    expect(parseRate("0")).toBeNull();
    expect(parseRate("1.123456789")).toBeNull();
    expect(convertMinor(1_000, "USD", "PHP", "56.25")).toBe(56_250); // $10.00 → ₱562.50
    expect(convertMinor(1_000, "JPY", "PHP", "0.38")).toBe(38_000); // ¥1,000 → ₱380.00
    expect(convertMinor(1_000, "KWD", "PHP", "185.5")).toBe(18_550); // KD1.000 → ₱185.50
    expect(convertMinor(56_250, "PHP", "JPY", "2.6")).toBe(1_462); // ₱562.50 → ¥1,462.5 → ¥1,462 (ties to even)
    expect(convertMinor(5, "USD", "PHP", "0.5")).toBe(2); // 2.5 → 2 (ties to even)
    expect(convertMinor(15, "USD", "PHP", "0.5")).toBe(8); // 7.5 → 8

    const doc = budget({ rates: [{ currency: "USD", rate: "56.25", effectiveFrom: "2027-01-01" }] });
    const state = active(doc, "2027-02-03", [
      spend("2027-02-02", 10, { currency: "USD" }),
      spend("2027-02-02", 1_000, { currency: "JPY" }),
    ]);
    expect(state.live.spentWeekMinor).toBe(56_250);
    const usd = state.items.find((i) => i.originalCurrency === "USD")!;
    expect(usd.rate).toBe("56.25");
    expect(state.items.find((i) => i.originalCurrency === "JPY")!.status).toBe("no_rate");
    expect(state.warnings).toContainEqual({ kind: "uncounted", count: 1 });
  });

  it("never applies a rate to expenses dated before it", () => {
    const doc = budget({ rates: [{ currency: "USD", rate: "50", effectiveFrom: "2027-02-10" }] });
    const state = active(doc, "2027-02-11", [spend("2027-02-02", 1, { currency: "USD" })]);
    expect(state.items[0]!.status).toBe("no_rate");
    expect(() => budget({ rates: [{ currency: "USD", rate: "0.000", effectiveFrom: "2027-02-01" }] })).toThrow();
  });

  it("picks the same copy of a duplicated record whatever the input order", () => {
    const a = spend("2027-02-02", 1_000);
    const b = { ...a, amountMinor: P(2_000) };
    const doc = budget();
    expect(active(doc, "2027-02-03", [a, b]).live.spentWeekMinor).toBe(active(doc, "2027-02-03", [b, a]).live.spentWeekMinor);
  });

  it("uses the rate in effect on each expense date", () => {
    const doc = budget({
      rates: [
        { currency: "USD", rate: "50", effectiveFrom: "2027-01-01" },
        { currency: "USD", rate: "60", effectiveFrom: "2027-02-10" },
      ],
    });
    const state = active(doc, "2027-02-11", [spend("2027-02-02", 1, { currency: "USD" }), spend("2027-02-10", 1, { currency: "USD" })]);
    expect(state.items.map((i) => i.amountMinor)).toEqual([5_000, 6_000]);
  });
});

describe("attribution", () => {
  it("puts each record in exactly one bucket, by precedence", () => {
    const rentId = uuid();
    const tripId = uuid();
    let doc = budget({
      outsideWeekly: ["lodging"],
      fixedCosts: [{ id: rentId, name: "Rent", amountMinor: P(20_000), category: "fees", dueDay: null }],
    });
    doc = withAnnotation(doc, {
      id: tripId, kind: "planned", createdAt: NOW, deletedAt: null, name: "Trip", amountMinor: P(9_000),
      from: "2027-02-10", to: "2027-02-12", coversAllSpending: true, category: null,
    });
    const linked = spend("2027-02-11", 100, { description: "Rent deposit" });
    doc = withAnnotation(doc, { id: uuid(), kind: "link", createdAt: NOW, deletedAt: null, ref: linked.ref, target: `fixed:${rentId}` });
    const sources = [
      linked, // explicit link beats the trip dates
      spend("2027-02-11", 200, { description: "Rent" }), // trip dates beat the fixed-cost name
      spend("2027-02-03", 300, { description: "February rent" }), // fixed cost by name
      spend("2027-02-04", 400, { category: "lodging" }), // outside the weekly budget
      spend("2027-02-05", 500), // weekly
    ];
    const state = active(doc, "2027-02-13", sources);
    const byAmount = new Map(state.items.map((i) => [i.originalMinor, i]));
    expect(byAmount.get(P(100))!.reason).toBe("linked");
    expect(byAmount.get(P(200))!.bucket).toMatchObject({ kind: "planned", id: tripId });
    expect(byAmount.get(P(300))!.bucket).toMatchObject({ kind: "fixed", id: rentId });
    expect(byAmount.get(P(400))!.bucket.kind).toBe("outside");
    expect(byAmount.get(P(500))!.bucket.kind).toBe("weekly");
    expect(state.months[0]!.spentMinor).toBe(P(1_500));
  });

  it("counts a record once even if it arrives twice", () => {
    const one = spend("2027-02-02", 1_000);
    expect(active(budget(), "2027-02-03", [one, { ...one }]).live.spentWeekMinor).toBe(P(1_000));
  });

  it("maps group categories onto the shared ones", async () => {
    const { budgetCategory } = await import("../budget");
    expect(budgetCategory("groceries", "Groceries", "x")).toBe("groceries");
    expect(budgetCategory("beach-stuff", "Taxi fares", "x")).toBe("transport");
    expect(budgetCategory(null, null, "Hotel night")).toBe("lodging");
    expect(budgetCategory("custom", "Misc", "Thing")).toBe("other");
  });
});

describe("planned spending, trips and reallocation", () => {
  it("counts a trip's spending against the trip, not the week", () => {
    const tripId = uuid();
    const doc = withAnnotation(budget({ monthlyLimitMinor: P(60_000) }), {
      id: tripId,
      kind: "planned",
      createdAt: NOW,
      deletedAt: null,
      name: "Baguio trip",
      amountMinor: P(15_000),
      from: "2027-02-12",
      to: "2027-02-14",
      coversAllSpending: true,
      category: null,
    });
    const sources = [spend("2027-02-13", 4_000), spend("2027-02-10", 1_000)];
    const state = active(doc, "2027-02-13", sources);
    expect(state.live.spentWeekMinor).toBe(P(1_000));
    const trip = state.live.reservations.find((r) => r.id === tripId)!;
    expect(trip.matchedMinor).toBe(P(4_000));
    expect(trip.reservedMinor).toBe(P(11_000));
    expect(state.live.availableMonthMinor).toBe(P(60_000 - 5_000 - 11_000));
  });

  it("moves allowance between weeks without changing the month's total", () => {
    const doc = withAnnotation(budget(), {
      id: uuid(),
      kind: "reallocation",
      createdAt: NOW,
      deletedAt: null,
      note: "Vacation week",
      deltas: [
        { segmentStart: "2027-02-15", deltaMinor: P(4_000) },
        { segmentStart: "2027-02-08", deltaMinor: P(-2_000) },
        { segmentStart: "2027-02-22", deltaMinor: P(-2_000) },
      ],
    });
    const feb = active(doc, "2027-02-08");
    const segs = feb.months[0]!.segments;
    expect(segs.map((s) => s.baseMinor + s.reallocationMinor)).toEqual([P(7_000), P(5_000), P(11_000), P(5_000)]);
  });
});

describe("settings history", () => {
  it("applies a change from the current week and leaves earlier weeks alone", () => {
    const sources = [spend("2027-02-02", 7_000), spend("2027-02-09", 7_000)];
    const doc = budget();
    const changed = withConfigChange(doc, config({ weeklyTargetMinor: P(8_000) }), "2027-02-17", {
      planId: uuid(),
      now: "2027-02-17T09:00:00.000Z",
      source: "manual",
      summary: "₱7,000 → ₱8,000",
    });
    expect(changed.plans.at(-1)!.effectiveFrom).toBe("2027-02-15");
    const before = active(doc, "2027-02-17", sources).months[0]!.segments;
    const after = active(changed, "2027-02-17", sources).months[0]!.segments;
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(after[2]!.baseMinor).toBe(P(8_000));
  });

  it("refuses to change a budget's currency", () => {
    expect(() =>
      withConfigChange(budget(), config({ currency: "USD" }), "2027-02-03", { planId: uuid(), now: NOW, source: "manual", summary: "" }),
    ).toThrow(/currency/);
  });

  it("is not started before its start date and off when turned off", () => {
    const doc = budget({}, "2027-03-01");
    expect(computeBudget({ doc, today: "2027-02-20", sources: [] }).status).toBe("not_started");
    expect(computeBudget({ doc: { ...doc, deletedAt: NOW }, today: "2027-03-02", sources: [] }).status).toBe("off");
    expect(computeBudget({ doc: null, today: "2027-03-02", sources: [] }).status).toBe("off");
  });
});

describe("suggestions and previews", () => {
  it("suggests a weekly allowance that fits a 31-day month when there is no history", () => {
    const s = suggestWeeklyTarget({ monthlyLimitMinor: P(60_000), fixedCostsMinor: 0, currency: "PHP", sources: [], today: "2027-02-10", weekStartsOn: 1 });
    expect(s.basis).toBe("limit");
    expect(s.weeklyMinor).toBe(P(13_500));
    expect(s.weeklyMinor * 31).toBeLessThanOrEqual(P(60_000) * 7);
  });

  it("uses past spending when there are three complete weeks of it, capped by the limit", () => {
    const history = [spend("2027-01-12", 5_000), spend("2027-01-19", 6_000), spend("2027-01-26", 7_000), spend("2027-02-02", 6_000)];
    const s = suggestWeeklyTarget({ monthlyLimitMinor: P(60_000), fixedCostsMinor: P(20_000), currency: "PHP", sources: history, today: "2027-02-10", weekStartsOn: 1 });
    expect(s.basis).toBe("history");
    expect(s.weeksOfHistory).toBe(4);
    expect(s.averageWeeklyMinor).toBe(P(6_000));
    expect(s.weeklyMinor).toBe(P(6_000));
    const tight = suggestWeeklyTarget({ monthlyLimitMinor: P(30_000), fixedCostsMinor: P(20_000), currency: "PHP", sources: history, today: "2027-02-10", weekStartsOn: 1 });
    expect(tight.weeklyMinor).toBeLessThanOrEqual(tight.maxWeeklyMinor);
  });

  it("suggests weekday weights from history", () => {
    const history = ["2027-01-16", "2027-01-23", "2027-01-30", "2027-02-06"].map((d) => spend(d, 2_000)); // Saturdays
    const weights = suggestDayWeights(history, "PHP", "2027-02-10", 1)!;
    expect(weights).toHaveLength(7);
    expect(weights[6]).toBeGreaterThan(weights[1]!);
    expect(Math.min(...weights)).toBeGreaterThanOrEqual(1);
  });

  it("previews a new budget and flags a plan that doesn't fit its limit", () => {
    const fits = previewNewBudget(config({ monthlyLimitMinor: P(60_000) }), [], "2027-02-01");
    expect(fits.fitsLimit).toBe(true);
    expect(fits.weeks).toHaveLength(4);
    const tooMuch = previewNewBudget(config({ monthlyLimitMinor: P(20_000) }), [], "2027-02-01");
    expect(tooMuch.fitsLimit).toBe(false);
  });

  it("answers affordability against the right scope", () => {
    const doc = budget({ monthlyLimitMinor: P(60_000) });
    const input = { doc, today: "2027-02-05", sources: [spend("2027-02-02", 2_000)] };
    // Friday: ₱5,000 left for Fri–Sun; the weekend's share is two of those three days.
    const fits = affordability(input, P(3_000), "weekend")!;
    expect(fits.verdict).toBe("fits");
    expect(fits.availableMinor).toBe(Math.floor(P(5_000) * 2 / 3));
    expect(fits.days).toEqual(["2027-02-06", "2027-02-07"]);
    expect(affordability(input, P(4_000), "weekend")!.verdict).toBe("fits_week");
    expect(affordability(input, P(4_000), "week")!.verdict).toBe("fits");
    const over = affordability(input, P(6_000), "weekend")!;
    expect(over.verdict).toBe("over_week");
    expect(over.nextWeekAfterMinor).toBe(P(6_000));
    expect(over.nextWeekNowMinor).toBe(P(7_000));
  });

  it("lays out recovery options for an overspent week", () => {
    const doc = budget();
    const plan = recoveryPlan({ doc, today: "2027-02-04", sources: [spend("2027-02-02", 10_000)] })!;
    expect(plan.deficitMinor).toBe(P(3_000));
    const full = plan.options.find((o) => o.recovery.mode === "full")!;
    expect(full.weeks.map((w) => w.allowanceMinor)).toEqual([P(4_000), P(7_000), P(7_000)]);
    const three = plan.options.find((o) => o.recovery.mode === "smoothed" && o.recovery.weeks === 3)!;
    expect(three.weeks.map((w) => w.allowanceMinor)).toEqual([P(6_000), P(6_000), P(6_000)]);
    expect(three.shortfallMinor).toBe(0);
  });
});

describe("sync merge", () => {
  const note = (createdAt: string) => ({ id: uuid(), kind: "exclude" as const, createdAt, deletedAt: null, ref: `personal:${uuid()}` });

  it("keeps changes from both devices and never compares clocks", () => {
    const base = budget();
    const local = withAnnotation(base, note("2027-02-02T00:00:00.000Z"));
    const server = withAnnotation(base, note("2027-02-03T00:00:00.000Z"));
    const merged = mergeBudgetDocuments(base, local, server);
    expect(merged.annotations).toHaveLength(2);
  });

  it("lets a deletion made here win over an unchanged server copy, and vice versa", () => {
    const n = note(NOW);
    const base = withAnnotation(budget(), n);
    const deletedHere = withoutAnnotation(base, n.id, "2027-02-05T00:00:00.000Z");
    expect(mergeBudgetDocuments(base, deletedHere, base).annotations[0]!.deletedAt).not.toBeNull();
    const deletedThere = withoutAnnotation(base, n.id, "2027-02-05T00:00:00.000Z");
    expect(mergeBudgetDocuments(base, base, deletedThere).annotations[0]!.deletedAt).not.toBeNull();
  });

  it("unions plan versions and keeps the account's budget when two were set up apart", () => {
    const base = budget();
    const meta = (id: string) => ({ planId: id, now: "2027-02-03T00:00:00.000Z", source: "manual" as const, summary: "" });
    const local = withConfigChange(base, config({ weeklyTargetMinor: P(8_000) }), "2027-02-03", meta(uuid()));
    const server = withConfigChange(base, config({ monthlyLimitMinor: P(90_000) }), "2027-02-03", meta(uuid()));
    expect(mergeBudgetDocuments(base, local, server).plans).toHaveLength(3);
    const other = budget();
    expect(mergeBudgetDocuments(null, local, other)).toBe(other);
  });

  it("tracks pending and synced states", () => {
    const doc = budget();
    let store = storeWithLocalChange(emptyBudgetStore(true), doc);
    expect(store.sync).toBe("pending");
    store = storeAfterSave(store, doc, "2027-02-01T00:00:01.000Z");
    expect(store.sync).toBe("synced");
    const edited = withAnnotation(doc, note(NOW));
    const during = storeWithLocalChange(store, edited);
    expect(storeAfterSave(during, doc, "2027-02-01T00:00:02.000Z").sync).toBe("pending");
    // A pull while nothing is pending adopts the server copy.
    const server = withAnnotation(doc, note(NOW));
    expect(storeWithServerCopy(store, server, "2027-02-01T00:00:03.000Z").doc).toEqual(server);
    // Guests never sync.
    expect(storeWithLocalChange(emptyBudgetStore(false), doc).sync).toBe("local");
  });
});

// ---------------------------------------------------------------------------
// Invariants over random histories (seeded, so failures reproduce).
// ---------------------------------------------------------------------------

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe("invariants on random histories", () => {
  const days = (from: string, count: number): string[] => {
    const out: string[] = [];
    const start = new Date(`${from}T00:00:00Z`).getTime();
    for (let i = 0; i < count; i++) out.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
    return out;
  };

  for (let seed = 1; seed <= 60; seed++) {
    it(`holds for history #${seed}`, () => {
      const random = rng(seed);
      const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
      const calendar = days("2026-09-14", 120);
      const today = pick(calendar.slice(30));
      const start = pick(calendar.slice(0, 40));
      const recovery = pick([{ mode: "full" as const }, { mode: "smoothed" as const, weeks: 2 + Math.floor(random() * 4) }]);
      const doc = budget(
        {
          monthlyLimitMinor: P(Math.floor(random() * 80_000)),
          weeklyTargetMinor: P(Math.floor(random() * 15_000)),
          weekStartsOn: Math.floor(random() * 7),
          recovery,
          monthEnd: pick(["carry_overspend", "fresh_start"] as const),
          dayWeights: random() < 0.5 ? null : Array.from({ length: 7 }, () => 1 + Math.floor(random() * 5)),
          outsideWeekly: random() < 0.3 ? ["lodging"] : [],
        },
        start,
      );
      const sources = Array.from({ length: Math.floor(random() * 80) }, () =>
        spend(pick(calendar), Math.floor(random() * 5_000) + 1, { category: pick(["food-drinks", "lodging", "transport"] as const) }),
      );
      const state = computeBudget({ doc, today, sources });
      if (today < start) {
        expect(state.status).toBe("not_started");
        return;
      }
      if (state.status !== "active") throw new Error("expected active");
      const live = state.live;
      expect(live.safeTodayMinor).toBeGreaterThanOrEqual(0);
      expect(live.safeTodayMinor).toBeLessThanOrEqual(live.availableWeekMinor);
      expect(live.availableWeekMinor).toBeLessThanOrEqual(live.availableMonthMinor);
      expect(live.availableMonthMinor).toBe(Math.max(0, live.remainingMonthMinor - live.reservedMinor));

      for (const month of state.months) {
        let weeklySpent = 0;
        let allocated = 0;
        for (const s of month.segments) {
          expect(s.allowanceMinor).toBeGreaterThanOrEqual(0);
          expect(s.allowanceMinor).toBeLessThanOrEqual(Math.max(0, s.capacityAtStartMinor));
          expect(s.allowanceMinor).toBeLessThanOrEqual(Math.max(0, s.theoreticalMinor));
          if (recovery.mode === "full") expect(s.theoreticalMinor).toBe(s.baseMinor + s.carryInMinor);
          if (s.state === "past") {
            expect(s.carryOutMinor).toBe(s.carryInMinor + s.baseMinor + s.reallocationMinor - s.spentMinor);
          }
          if (s.state !== "future") {
            weeklySpent += s.spentMinor;
            allocated += s.baseMinor + s.reallocationMinor;
          }
        }
        // The ledger never loses or invents money: carry = opening + allocated − spent.
        expect(month.closingCarryMinor).toBe(month.openingMinor + allocated - weeklySpent);
        expect(month.openingMinor).toBeLessThanOrEqual(0);
      }

      // Order of the input never matters.
      const shuffled = [...sources].sort(() => random() - 0.5);
      expect(computeBudget({ doc, today, sources: shuffled })).toEqual(state);

      // A settings change from this week never alters earlier weeks.
      const changed = withConfigChange(doc, { ...state.live.config, weeklyTargetMinor: P(1_234) }, today, {
        planId: uuid(),
        now: "2027-01-02T00:00:00.000Z",
        source: "manual",
        summary: "",
      });
      const after = computeBudget({ doc: changed, today, sources });
      if (after.status !== "active") throw new Error("expected active");
      const from = changed.plans.at(-1)!.effectiveFrom;
      const earlier = (s: Active) => s.months.flatMap((m) => m.segments).filter((seg) => seg.end < from);
      expect(earlier(after)).toEqual(earlier(state));
    });
  }
});
