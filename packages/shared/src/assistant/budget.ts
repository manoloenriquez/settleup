import { DEFAULT_EXPENSE_CATEGORIES } from "../constants";
import { formatAmount } from "../utils/amount";
import type { CategorySlug } from "../utils/category";
import type { CurrencyCode } from "../utils/currency";
import {
  addDays,
  addMonths,
  affordability,
  budgetCurrency,
  budgetRevision,
  computeBudget,
  dateRange,
  dayOfWeek,
  defaultBudgetConfig,
  explainLineCopy,
  explainWeek,
  monthEnd,
  monthOf,
  monthStart,
  previewChange,
  previewNewBudget,
  recoveryPlan,
  savingsSummary,
  shortDate,
  suggestWeeklyTarget,
  versionAt,
  type ActiveBudget,
  type AffordScope,
  type BudgetConfig,
  type BudgetDocument,
  type BudgetInput,
} from "../budget";
import type { AssistantCommand } from "./command";
import { amountFromText } from "./text";
import type { AssistantBudget, AssistantHints, AssistantPlan, AssistantSnapshot, ClarifyChoice, PreviewLine } from "./types";

// ---------------------------------------------------------------------------
// The Assistant's budget answers and changes. Every number comes from the
// budget engine (packages/shared/src/budget) applied to the person's own
// data; amounts the person asks about must appear in their words. Changes
// are proposals with a preview of what they do to the coming weeks, and are
// applied only after Confirm (re-checked against the budget's revision).
// ---------------------------------------------------------------------------

export type BudgetResolveInput = {
  command: AssistantCommand;
  text: string;
  snapshot: AssistantSnapshot;
  hints: AssistantHints;
  newId: () => string;
};

const SETUP_ROUTE = { screen: "budget_setup" } as const;

/** Category words people use → the shared category. */
const CATEGORY_WORDS: [RegExp, CategorySlug][] = [
  [/^(dining|food|eating out|restaurants?|coffee)$/, "food-drinks"],
  [/^(groceries|grocery)$/, "groceries"],
  [/^(transport|transportation|commute|grab|taxi|gas)$/, "transport"],
  [/^(shopping|clothes)$/, "shopping"],
  [/^(travel|lodging|hotels?)$/, "lodging"],
  [/^(entertainment|activities|fun)$/, "activities"],
  [/^(bills|fees|subscriptions)$/, "fees"],
  [/^(supplies)$/, "supplies"],
];

export function categoryFromWord(word: string | null): CategorySlug | null {
  if (!word) return null;
  const lower = word.toLowerCase().trim();
  return CATEGORY_WORDS.find(([re]) => re.test(lower))?.[1] ?? null;
}

function categoryName(slug: CategorySlug): string {
  return DEFAULT_EXPENSE_CATEGORIES.find((c) => c.slug === slug)?.name ?? "Other";
}

function money(n: number, currency: CurrencyCode): string {
  return formatAmount(n, currency);
}

function liveDoc(budget: AssistantBudget): BudgetDocument | null {
  return budget.doc && !budget.doc.deletedAt ? budget.doc : null;
}

function inputOf(snapshot: AssistantSnapshot, budget: AssistantBudget): BudgetInput {
  return { doc: budget.doc, today: snapshot.today, sources: budget.sources, ...(budget.sharesComplete === undefined ? {} : { sharesComplete: budget.sharesComplete }) };
}

function noBudget(): AssistantPlan {
  return {
    kind: "refuse",
    text: "You don't have a budget yet. Tell me what you want to spend in a month, like \"Set up a budget of 60k a month\", or set one up yourself.",
    route: SETUP_ROUTE,
  };
}

function scopeOf(command: AssistantCommand): AffordScope {
  const when = (command.dateMention ?? "").toLowerCase();
  if (/today|tonight|ngayon/.test(when)) return "today";
  if (/weekend/.test(when)) return "weekend";
  if (/month/.test(when) || command.budgetField === "monthly") return "month";
  return "week";
}

const SCOPE_LABEL: Record<AffordScope, string> = {
  today: "today",
  weekend: "this weekend",
  week: "the rest of this week",
  month: "the rest of this month",
};

function statusAnswer(state: ActiveBudget, command: AssistantCommand): AssistantPlan {
  const { live, currency } = state;
  const m = (n: number): string => money(n, currency);
  const setAside = live.reservedMinor > 0 ? `, after ${m(live.reservedMinor)} set aside` : "";
  const lead =
    live.overWeekMinor > 0
      ? `You're ${m(live.overWeekMinor)} over this week's allowance, so nothing more is safe to spend today. ${m(live.availableMonthMinor)} is left this month${setAside}.`
      : scopeOf(command) === "month"
        ? `${m(live.availableMonthMinor)} is left this month${setAside}. This week you have ${m(live.availableWeekMinor)}, and ${m(live.safeTodayMinor)} is safe to spend today.`
        : `You can safely spend ${m(live.safeTodayMinor)} today. ${m(live.availableWeekMinor)} is left this week and ${m(live.availableMonthMinor)} this month${setAside}.`;
  return {
    kind: "answer",
    text: lead,
    card: {
      type: "totals",
      title: "Your budget",
      rows: [
        { label: "Safe to spend today", amountMinor: live.safeTodayMinor, currency },
        { label: live.overWeekMinor > 0 ? "Over this week" : "Left this week", amountMinor: live.overWeekMinor > 0 ? live.overWeekMinor : live.availableWeekMinor, currency },
        { label: "Left this month", amountMinor: live.availableMonthMinor, currency },
      ],
    },
  };
}

function affordAnswer(input: BudgetInput, state: ActiveBudget, command: AssistantCommand, text: string): AssistantPlan {
  const currency = state.currency;
  const amount = amountFromText(command.amount, text, currency);
  if (amount === null) return { kind: "clarify", text: "How much is it? I'll check it against your budget.", choices: [] };
  const scope = scopeOf(command);
  const result = affordability(input, amount, scope);
  if (!result) return noBudget();
  const m = (n: number): string => money(n, currency);
  const share = scope === "today" ? "today's share" : scope === "weekend" ? "the weekend's share" : "";
  let reply: string;
  switch (result.verdict) {
    case "fits":
      reply = `Yes. You have ${m(result.availableMinor)} for ${SCOPE_LABEL[scope]}, so ${m(amount)} leaves ${m(result.afterMinor)}.`;
      break;
    case "fits_week":
      reply = `You can, but it's more than ${share} (${m(result.availableMinor)}). This week still covers it: you'd have ${m(result.availableWeekMinor - amount)} left for the other days.`;
      break;
    case "over_week":
      reply =
        `Not within this week: you have ${m(result.availableWeekMinor)} left this week. It still fits your month (${m(result.availableMonthMinor)} left)` +
        (result.nextWeekAfterMinor !== null && result.nextWeekNowMinor !== null
          ? `, but next week's allowance would drop from ${m(result.nextWeekNowMinor)} to ${m(result.nextWeekAfterMinor)}.`
          : ", and the overspending would carry to the end of the month.");
      break;
    case "over_month":
      reply = `No. ${m(amount)} is more than the ${m(result.availableMonthMinor)} left this month after what's set aside; it would put you ${m(amount - result.availableMonthMinor)} over your monthly limit.`;
      break;
  }
  return {
    kind: "answer",
    text: reply,
    card: {
      type: "totals",
      title: `Can I spend ${m(amount)}?`,
      rows: [
        ...(scope === "today" || scope === "weekend" ? [{ label: scope === "today" ? "Safe today" : "This weekend's share", amountMinor: result.availableMinor, currency }] : []),
        { label: "Left this week", amountMinor: result.availableWeekMinor, currency },
        { label: "Left this month", amountMinor: result.availableMonthMinor, currency },
      ],
    },
  };
}

function explainAnswer(state: ActiveBudget): AssistantPlan {
  const lines = explainWeek(state);
  const copies = lines.map((line) => explainLineCopy(line, state.currency));
  const parts = copies.filter((c, i) => lines[i]!.kind !== "allowance" && lines[i]!.kind !== "base");
  const base = copies[0]!;
  const total = copies.at(-1)!;
  const why =
    parts.length === 0
      ? `This week is your plain weekly allowance of ${base.value}${base.detail ? ` (${base.detail})` : ""}.`
      : `This week's ${total.value} is your ${base.value} weekly allowance ${parts.map((p) => `${p.value} (${p.label.toLowerCase()}${p.detail ? `: ${p.detail}` : ""})`).join(", ")}.`;
  return {
    kind: "answer",
    text: why,
    card: {
      type: "totals",
      title: `This week · ${dateRange(state.live.segment.start, state.live.segment.end)}`,
      rows: lines.map((line, i) => ({ label: copies[i]!.label, amountMinor: line.amountMinor, currency: state.currency, ...(copies[i]!.detail ? { sub: copies[i]!.detail } : {}) })),
    },
  };
}

function savingsAnswer(state: ActiveBudget): AssistantPlan {
  const s = savingsSummary(state);
  const m = (n: number): string => money(n, state.currency);
  const parts: string[] = [];
  if (s.monthsCompleted > 0) {
    parts.push(
      `In the ${s.monthsCompleted === 1 ? "month" : `${s.monthsCompleted} months`} you've finished, you left ${m(s.savedPastMinor)} of your weekly allowance unspent and finished ${m(s.underLimitsMinor)} under your monthly limits.`,
    );
  }
  parts.push(
    s.carryNowMinor > 0
      ? `This month, ${m(s.carryNowMinor)} of earlier weeks' allowance is still unspent and carried into this week.`
      : "This month, no unspent allowance has carried into this week yet.",
  );
  return {
    kind: "answer",
    text: parts.join(" "),
    card: {
      type: "totals",
      title: "Saved by underspending",
      rows: [
        ...(s.monthsCompleted > 0 ? [{ label: "Earlier months", amountMinor: s.savedPastMinor, currency: state.currency }] : []),
        { label: "Carried into this week", amountMinor: s.carryNowMinor, currency: state.currency },
      ],
    },
  };
}

function forecastAnswer(state: ActiveBudget): AssistantPlan {
  const { live, currency } = state;
  const month = state.months.at(-1)!;
  const m = (n: number): string => money(n, currency);
  const text = live.onTrack
    ? `At your pace this month ends at about ${m(live.projectedMonthMinor)}, within your ${m(month.effectiveLimitMinor)} limit.`
    : `At your pace this month ends at about ${m(live.projectedMonthMinor)}, ${m(live.projectedMonthMinor - month.effectiveLimitMinor)} over your ${m(month.effectiveLimitMinor)} limit. Spending ${m(live.safeTodayMinor)} or less a day keeps you on plan.`;
  return {
    kind: "answer",
    text: `${text} That counts what you've spent, what's set aside, and your usual weekly spending for the ${live.daysLeftInMonth} days left.`,
    card: {
      type: "totals",
      title: "This month",
      rows: [
        { label: "Spent so far", amountMinor: month.spentMinor, currency },
        { label: "Set aside", amountMinor: live.reservedMinor, currency },
        { label: "Month end at this pace", amountMinor: live.projectedMonthMinor, currency },
        { label: "Monthly limit", amountMinor: month.effectiveLimitMinor, currency },
      ],
    },
  };
}

function breakdownAnswer(state: ActiveBudget): AssistantPlan {
  const month = state.months.at(-1)!;
  const rows = month.byCategory.filter((c) => c.spentMinor > 0).sort((a, b) => b.spentMinor - a.spentMinor);
  if (rows.length === 0) return { kind: "answer", text: "Nothing counted this month yet." };
  const m = (n: number): string => money(n, state.currency);
  const [top, ...rest] = rows;
  const text =
    `Most of your money this month went to ${categoryName(top!.category)} (${m(top!.spentMinor)})` +
    (rest.length ? `, then ${rest.slice(0, 2).map((r) => `${categoryName(r.category)} (${m(r.spentMinor)})`).join(" and ")}.` : ".") +
    " That's your own spending, including your share of group expenses.";
  return {
    kind: "answer",
    text,
    card: {
      type: "totals",
      title: "Where it went this month",
      rows: rows.map((r) => ({
        label: categoryName(r.category),
        amountMinor: r.spentMinor,
        currency: state.currency,
        ...(r.limitMinor !== null ? { sub: `Limit ${m(r.limitMinor)}` } : {}),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function nextWeekRange(state: ActiveBudget): { from: string; to: string } {
  const from = addDays(state.live.segment.end, 1);
  const to = addDays(from, 6);
  return { from, to: monthOf(to) === monthOf(from) ? to : monthEnd(monthOf(from)) };
}

/** "next week", "this weekend", "next month" → a range inside one month. */
function planRange(state: ActiveBudget, mention: string | null): { from: string; to: string } | null {
  const today = state.live.today;
  const when = (mention ?? "").toLowerCase();
  if (/next week/.test(when)) return nextWeekRange(state);
  if (/this weekend|^weekend$/.test(when)) {
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(today, i)).filter((d) => dayOfWeek(d) === 6 || dayOfWeek(d) === 0);
    const from = days[0]!;
    const to = dayOfWeek(from) === 6 ? addDays(from, 1) : from;
    return { from, to: monthOf(to) === monthOf(from) ? to : from };
  }
  if (/next weekend/.test(when)) {
    const saturday = [7, 8, 9, 10, 11, 12, 13].map((i) => addDays(today, i)).find((d) => dayOfWeek(d) === 6)!;
    const sunday = addDays(saturday, 1);
    return { from: saturday, to: monthOf(sunday) === monthOf(saturday) ? sunday : saturday };
  }
  if (/today|tonight/.test(when)) return { from: today, to: today };
  return null;
}

function effectiveFromOf(state: ActiveBudget, mention: string | null): string | null {
  const when = (mention ?? "").toLowerCase();
  if (/next month/.test(when)) return monthStart(addMonths(monthOf(state.live.today), 1));
  if (/next week/.test(when)) return addDays(state.live.segment.end, 1);
  return null;
}

function setupProposal(input: BudgetResolveInput, budget: AssistantBudget): AssistantPlan {
  const { command, text, snapshot } = input;
  const currency = snapshot.defaultCurrency;
  const amount = amountFromText(command.amount, text, currency);
  if (amount === null) {
    return { kind: "clarify", text: "What's the most you want to spend in a month? For example \"60k\".", choices: [] };
  }
  const weeklyGiven = /\b(a|per|each) week\b|\bweekly\b/i.test(text) && !/\b(a|per|each) month\b|\bmonthly\b/i.test(text);
  const config: BudgetConfig = { ...defaultBudgetConfig(currency) };
  let reason: string;
  if (weeklyGiven) {
    config.weeklyTargetMinor = amount;
    // A monthly limit that fits the weekly allowance even in a 31-day month.
    config.monthlyLimitMinor = Math.ceil((amount * 31) / 7);
    reason = `${money(amount, currency)} a week, with a monthly limit that covers a 31-day month.`;
  } else {
    config.monthlyLimitMinor = amount;
    const suggestion = suggestWeeklyTarget({ monthlyLimitMinor: amount, fixedCostsMinor: 0, currency, sources: budget.sources, today: snapshot.today, weekStartsOn: config.weekStartsOn });
    config.weeklyTargetMinor = suggestion.weeklyMinor;
    reason =
      suggestion.basis === "history"
        ? `Based on your last ${suggestion.weeksOfHistory} weeks (about ${money(suggestion.averageWeeklyMinor ?? 0, currency)} a week), I suggest ${money(suggestion.weeklyMinor, currency)} a week.`
        : `I suggest ${money(suggestion.weeklyMinor, currency)} a week: the most that fits ${money(amount, currency)} in a 31-day month. I don't have enough of your past spending to go on yet, so adjust it once you see a few weeks.`;
  }
  const preview = previewNewBudget(config, budget.sources, snapshot.today);
  const first = preview.weeks[0];
  const lines: PreviewLine[] = [
    { label: "Monthly limit", value: money(config.monthlyLimitMinor, currency) },
    { label: "Weekly allowance", value: money(config.weeklyTargetMinor, currency) },
    { label: "Each day", value: `about ${money(Math.floor(config.weeklyTargetMinor / 7), currency)}` },
    ...(first ? [{ label: `This week (${dateRange(first.start, first.end)})`, value: money(first.allowanceMinor, currency) }] : []),
    { label: "When you overspend", value: "Next week's allowance is lowered" },
  ];
  return {
    kind: "propose",
    text: `${reason} Unused allowance rolls into the next week, and overspending comes out of it. You can add fixed costs like rent later so they're set aside first.`,
    proposal: {
      id: input.newId(),
      risk: "write",
      title: "Set up a budget",
      lines,
      action: { type: "budget_setup", config, startDate: snapshot.today, revision: budgetRevision(budget.doc) },
      requiresConnection: false,
    },
  };
}

function fieldChoices(): ClarifyChoice[] {
  return [
    { label: "Monthly limit", hints: { budgetField: "monthly" } },
    { label: "Weekly allowance", hints: { budgetField: "weekly" } },
    { label: "Daily amount", hints: { budgetField: "daily" } },
  ];
}

function changed(current: number, kind: AssistantCommand["changeKind"], amount: number | null, percent: number): number | null {
  if (percent > 0) {
    if (kind === "increase") return Math.round((current * (100 + percent)) / 100);
    if (kind === "decrease") return Math.round((current * (100 - percent)) / 100);
    return null;
  }
  if (amount === null) return null;
  if (kind === "increase") return current + amount;
  if (kind === "decrease") return current - amount;
  return amount;
}

function changeProposal(input: BudgetResolveInput, budget: AssistantBudget, doc: BudgetDocument, state: ActiveBudget): AssistantPlan {
  const { command, text, snapshot, hints } = input;
  const currency = budgetCurrency(doc);
  const current = versionAt(doc, snapshot.today).config;
  const amount = amountFromText(command.amount, text, currency);
  const percent = command.percent > 0 && new RegExp(`${String(command.percent).replace(".", "\\.")}\\s?(%|percent)`, "i").test(text) ? command.percent : 0;
  const kind = command.changeKind === "none" ? "set" : command.changeKind;
  if (amount === null && percent === 0) {
    return { kind: "clarify", text: "By how much? Say an amount like \"1k\" or a percentage like \"10%\".", choices: [] };
  }
  const m = (n: number): string => money(n, currency);
  const category = command.budgetField === "category" ? categoryFromWord(command.description) : null;
  const field = hints.budgetField ?? (command.budgetField === "category" ? (category ? "category" : "none") : command.budgetField);
  const next: BudgetConfig = { ...current };
  const lines: PreviewLine[] = [];
  let summary: string;

  if (field === "category" && category) {
    const existing = current.categoryLimits.find((l) => l.category === category)?.limitMinor ?? null;
    if (existing === null && kind === "decrease") {
      return { kind: "refuse", text: `You don't have a ${categoryName(category)} limit yet. Say "Set my ${command.description ?? "category"} budget to 5k" to add one.` };
    }
    const value = changed(existing ?? 0, kind, amount, percent);
    if (value === null || value <= 0) return { kind: "refuse", text: `That would take your ${categoryName(category)} limit to zero or below.` };
    next.categoryLimits = [...current.categoryLimits.filter((l) => l.category !== category), { category, limitMinor: value }];
    lines.push({ label: `${categoryName(category)} limit (monthly)`, value: m(value), ...(existing !== null ? { before: m(existing) } : {}) });
    summary = `${categoryName(category)} limit ${existing !== null ? `${m(existing)} → ` : ""}${m(value)}`;
  } else if (field === "none" && percent > 0) {
    // "Reduce my spending by 15%": the monthly limit and the weekly allowance move together.
    const monthly = changed(current.monthlyLimitMinor, kind, null, percent);
    const weekly = changed(current.weeklyTargetMinor, kind, null, percent);
    if (monthly === null || weekly === null) return { kind: "clarify", text: "Up or down? Say \"reduce by 15%\" or \"increase by 10%\".", choices: [] };
    next.monthlyLimitMinor = monthly;
    next.weeklyTargetMinor = weekly;
    lines.push({ label: "Monthly limit", value: m(monthly), before: m(current.monthlyLimitMinor) });
    lines.push({ label: "Weekly allowance", value: m(weekly), before: m(current.weeklyTargetMinor) });
    summary = `${kind === "decrease" ? "−" : "+"}${percent}%: monthly ${m(current.monthlyLimitMinor)} → ${m(monthly)}, weekly ${m(current.weeklyTargetMinor)} → ${m(weekly)}`;
  } else if (field === "monthly" || field === "weekly" || field === "daily") {
    const before = field === "monthly" ? current.monthlyLimitMinor : field === "weekly" ? current.weeklyTargetMinor : Math.floor(current.weeklyTargetMinor / 7);
    const value = changed(before, kind, amount, percent);
    if (value === null || value < 0) return { kind: "refuse", text: "That would take it below zero." };
    if (value === before) return { kind: "answer", text: `It's already ${m(value)}.` };
    if (field === "monthly") next.monthlyLimitMinor = value;
    else if (field === "weekly") next.weeklyTargetMinor = value;
    else {
      next.weeklyTargetMinor = value * 7;
      next.dayWeights = null;
    }
    const label = field === "monthly" ? "Monthly limit" : field === "weekly" ? "Weekly allowance" : "Each day";
    lines.push({ label, value: m(value), before: m(before) });
    if (field === "daily") lines.push({ label: "Weekly allowance", value: m(value * 7), before: m(current.weeklyTargetMinor) });
    summary = `${label} ${m(before)} → ${m(value)}`;
  } else {
    return { kind: "clarify", text: "Which part of your budget?", choices: fieldChoices() };
  }

  const effectiveFrom = effectiveFromOf(state, command.dateMention);
  const preview = previewChange(doc, next, budget.sources, snapshot.today, effectiveFrom ?? undefined);
  if (preview.state.status === "active") {
    const week = preview.state.live.segment;
    if (!effectiveFrom) lines.push({ label: `This week (${dateRange(week.start, week.end)})`, value: m(week.allowanceMinor), before: m(state.live.segment.allowanceMinor) });
  }
  if (effectiveFrom) lines.push({ label: "Starts", value: shortDate(effectiveFrom) });
  if (!preview.fitsLimit) {
    lines.push({ label: "Heads up", value: `The weekly plan and set-aside spending add up to ${m(preview.plannedMonthMinor)}, more than the monthly limit` });
  }
  return {
    kind: "propose",
    text: effectiveFrom ? `Here's the change, starting ${shortDate(effectiveFrom)}.` : "Here's the change. It applies from the start of this week.",
    proposal: {
      id: input.newId(),
      risk: "write",
      title: "Change your budget",
      lines,
      action: { type: "budget_change", config: next, summary: `${summary} (Assistant)`.slice(0, 200), effectiveFrom, revision: budgetRevision(doc) },
      requiresConnection: false,
    },
  };
}

function recoverPlan(input: BudgetResolveInput, budget: AssistantBudget, doc: BudgetDocument, state: ActiveBudget): AssistantPlan {
  const { command, hints, snapshot } = input;
  const plan = recoveryPlan({ ...inputOf(snapshot, budget), doc });
  const m = (n: number): string => money(n, state.currency);
  if (!plan || plan.deficitMinor === 0) {
    return { kind: "answer", text: `You're not over your allowance, so there's nothing to make up. ${m(state.live.availableWeekMinor)} is left this week.` };
  }
  const describe = (weeks: number): string => (weeks <= 1 ? "All from next week" : `Spread over ${weeks} weeks`);
  const optionFor = (weeks: number) => plan.options.find((o) => (weeks <= 1 ? o.recovery.mode === "full" : o.recovery.mode === "smoothed" && o.recovery.weeks === weeks));
  const chosen = hints.recoveryWeeks ?? (command.count >= 1 && command.count <= 4 ? command.count : null);
  if (chosen === null) {
    const choices: ClarifyChoice[] = [1, 2, 3, 4].flatMap((weeks) => {
      const option = optionFor(weeks);
      if (!option) return [];
      const next = option.weeks[0];
      const extra = option.shortfallMinor > 0 ? `, ${m(option.shortfallMinor)} won't fit this month` : "";
      return [{ label: `${describe(weeks)}${next ? ` (next week ${m(next.allowanceMinor)}${extra})` : extra}`, hints: { recoveryWeeks: weeks } }];
    });
    return {
      kind: "clarify",
      text: `You're ${m(plan.deficitMinor)} over so far. You can make it up all at once next week, or spread it over a few weeks; it's never forgiven, only paced. Which works better?`,
      choices,
    };
  }
  const option = optionFor(chosen);
  if (!option) return { kind: "answer", text: "I can spread overspending over 1 to 4 weeks." };
  const recovery: BudgetConfig["recovery"] = chosen <= 1 ? { mode: "full" } : { mode: "smoothed", weeks: chosen };
  const current = versionAt(doc, snapshot.today).config;
  if (JSON.stringify(current.recovery) === JSON.stringify(recovery)) {
    return { kind: "answer", text: `That's already how your budget makes up overspending. Next week's allowance: ${option.weeks[0] ? m(option.weeks[0].allowanceMinor) : "the last week of the month is this one"}.` };
  }
  const lines: PreviewLine[] = [
    { label: "Overspending to make up", value: m(plan.deficitMinor) },
    { label: "How", value: describe(chosen) },
    ...option.weeks.slice(0, 4).map((w) => ({ label: `Week of ${shortDate(w.start)}`, value: m(w.allowanceMinor) })),
    ...(option.shortfallMinor > 0 ? [{ label: "Doesn't fit this month", value: m(option.shortfallMinor) }] : []),
  ];
  return {
    kind: "propose",
    text: option.shortfallMinor > 0 ? `${m(option.shortfallMinor)} of it can't be made up before the month ends; your month-end setting decides what happens to it.` : "Here's how the coming weeks would look.",
    proposal: {
      id: input.newId(),
      risk: "write",
      title: "Make up overspending",
      lines,
      action: { type: "budget_change", config: { ...current, recovery }, summary: `Recovery: ${describe(chosen)} (Assistant)`, effectiveFrom: null, revision: budgetRevision(doc) },
      requiresConnection: false,
    },
  };
}

function planProposal(input: BudgetResolveInput, doc: BudgetDocument, state: ActiveBudget): AssistantPlan {
  const { command, text } = input;
  const currency = state.currency;
  const name = (command.description ?? "Planned spending").slice(0, 60);
  const trip = /\b(vacation|holiday|trip|travel|bakasyon)\b/i.test(`${name} ${text}`);
  const amount = amountFromText(command.amount, text, currency);
  if (amount === null) {
    return { kind: "clarify", text: `How much do you expect to spend${trip ? ` on the ${name.toLowerCase()}` : ""}? I'll set it aside so it doesn't come out of your weekly allowance.`, choices: [] };
  }
  const range = planRange(state, command.dateMention);
  if (!range) return { kind: "clarify", text: `When is it? Say "next week", "this weekend" or "today".`, choices: [] };
  const from = range.from;
  const to = trip ? range.to : range.from;
  const m = (n: number): string => money(n, currency);
  const sameMonth = monthOf(from) === monthOf(state.live.today);
  const left = state.live.availableMonthMinor - amount;
  const lines: PreviewLine[] = [
    { label: "Set aside", value: `${m(amount)} for ${name}` },
    { label: trip ? "Dates" : "When", value: dateRange(from, to) },
    { label: "Counts", value: trip ? "Everything you spend in those dates" : `Expenses named "${name}"` },
    ...(sameMonth ? [{ label: "Free this month after", value: left >= 0 ? m(left) : `${m(-left)} over the limit` }] : []),
  ];
  return {
    kind: "propose",
    text: trip
      ? `I'll set ${m(amount)} aside for your ${name.toLowerCase()}. Spending during it counts toward that instead of your weekly allowance, and the month's free amount drops now so the money's there.`
      : `I'll set ${m(amount)} aside for ${name} so it doesn't come out of your weekly allowance.`,
    proposal: {
      id: input.newId(),
      risk: "write",
      title: "Plan spending",
      lines,
      action: { type: "budget_plan", name, amountMinor: amount, from, to, coversAllSpending: trip, revision: budgetRevision(doc) },
      requiresConnection: false,
    },
  };
}

export function resolveBudget(input: BudgetResolveInput): AssistantPlan {
  const budget = input.snapshot.budget;
  if (!budget) return { kind: "refuse", text: "Your budget is still loading. Try again in a moment." };
  const intent = input.command.budgetIntent === "none" ? "status" : input.command.budgetIntent;
  const doc = liveDoc(budget);
  if (intent === "setup" && !doc) return setupProposal(input, budget);
  if (!doc) return noBudget();
  const state = computeBudget(inputOf(input.snapshot, budget));
  if (state.status === "not_started") {
    return { kind: "answer", text: `Your budget starts on ${shortDate(state.startDate)}.` };
  }
  if (state.status !== "active") return noBudget();
  switch (intent) {
    case "setup":
      // Already have one: "a budget of 70k a month" changes the monthly limit.
      return changeProposal({ ...input, command: { ...input.command, budgetIntent: "change", budgetField: input.command.budgetField === "none" ? "monthly" : input.command.budgetField, changeKind: "set" } }, budget, doc, state);
    case "status":
      return statusAnswer(state, input.command);
    case "afford":
      return affordAnswer(inputOf(input.snapshot, budget), state, input.command, input.text);
    case "explain":
      return explainAnswer(state);
    case "savings":
      return savingsAnswer(state);
    case "forecast":
      return forecastAnswer(state);
    case "breakdown":
      return breakdownAnswer(state);
    case "change":
      return changeProposal(input, budget, doc, state);
    case "recover":
      return recoverPlan(input, budget, doc, state);
    case "plan":
      return planProposal(input, doc, state);
  }
}

/** Confirm-time check for budget proposals: the budget must be the one the preview was made from. */
export function revalidateBudget(revision: string, snapshot: AssistantSnapshot): string | null {
  const budget = snapshot.budget;
  if (!budget) return "Your budget isn't loaded. Try again in a moment.";
  if (budgetRevision(budget.doc) !== revision) return "Your budget changed since I showed you this. Ask again to see the latest.";
  return null;
}
