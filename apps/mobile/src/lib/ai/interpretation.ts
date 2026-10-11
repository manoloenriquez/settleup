import type { ExpenseDraft, ExpenseDraftSplit, InsightsSummary, SmartSplitResult } from "@template/shared/types";
import { equalSplit, percentSplit, sharesSplit, inferCategorySlug, isCategorySlug, resolveDateMention, formatAmount, type CurrencyCode } from "@template/shared";
import type { ExpenseInterpretation, SplitInterpretation, SplitShare } from "./apple-intelligence";

// ---------------------------------------------------------------------------
// Pure mappers between what the on-device model says and what the app stores.
// The model interprets language; everything numeric here is ordinary code:
// splitting cents, resolving "yesterday", matching names. No React Native
// imports, so these run under the node test runner.
// ---------------------------------------------------------------------------

const SELF_WORDS = /^(me|i|myself|my|mine)$/i;

/** Replaces first-person words with the signed-in member's display name. */
export function resolveSelfName(name: string | null, userName: string | null): string | null {
  if (name === null) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return SELF_WORDS.test(trimmed) && userName ? userName : trimmed;
}

/** True when the user's own words contain the amount the model reported (guards against invented amounts). */
export function amountAppearsInText(amount: number, text: string): boolean {
  if (!(amount > 0)) return false;
  // Whole numeric tokens only, so 500 never matches "1500"; "2,400", "₱1,250.50" and "2k" all count.
  const tokens = text.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?k?/gi) ?? [];
  return tokens.some((token) => {
    const thousands = /k$/i.test(token);
    const value = Number.parseFloat(token.replace(/k$/i, "")) * (thousands ? 1000 : 1);
    return Number.isFinite(value) && Math.abs(value - amount) < 0.005;
  });
}

export function interpretationToDraft(
  interpretation: ExpenseInterpretation,
  input: { text: string; userName: string | null; today: string },
): { reply: string; draft: ExpenseDraft | null } {
  const amountCents = Math.round(interpretation.amount * 100);
  if (!interpretation.isExpense || !(amountCents > 0)) {
    return {
      reply: interpretation.isExpense
        ? "I couldn't find an amount. How much was it?"
        : interpretation.reply || "That doesn't look like an expense. Try something like \"Dinner 2400 split with Ana and Ben\".",
      draft: null,
    };
  }
  // The model must not invent an amount: the number has to be in the user's own message.
  if (!amountAppearsInText(interpretation.amount, input.text)) {
    return { reply: "I couldn't find that amount in your message. How much was it?", draft: null };
  }
  const itemName = interpretation.itemName.trim() || "Expense";
  const category = isCategorySlug(interpretation.category) && interpretation.category !== "other"
    ? interpretation.category
    : (inferCategorySlug(itemName) ?? (isCategorySlug(interpretation.category) ? interpretation.category : "other"));
  const participantNames = interpretation.participantNames
    .map((name) => resolveSelfName(name, input.userName))
    .filter((name): name is string => name !== null);
  const draft: ExpenseDraft = {
    item_name: itemName,
    amount_cents: amountCents,
    confidence: 0.9,
    participant_names: dedupe(participantNames),
    payer_name: resolveSelfName(interpretation.payerName, input.userName),
    category_slug: category,
    notes: interpretation.notes?.trim() || null,
    date: resolveDateMention(interpretation.dateMention, input.today),
    source: "conversation",
    split: draftSplit(interpretation, input.userName),
  };
  return { reply: interpretation.reply, draft };
}

function draftSplit(interpretation: ExpenseInterpretation, userName: string | null): ExpenseDraftSplit | null {
  if (interpretation.splitMode === "equal" || interpretation.splitMode === "unspecified") return null;
  if (interpretation.splitDetails.length === 0) return null;
  return {
    mode: interpretation.splitMode,
    shares: interpretation.splitDetails.map((share) => ({
      member_name: resolveSelfName(share.name, userName) ?? share.name,
      percent: share.percent,
      weight: share.weight,
      fixed_cents: share.fixedAmount === null ? null : Math.round(share.fixedAmount * 100),
      excluded: share.excluded,
    })),
  };
}

function dedupe(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// -- Smart split --------------------------------------------------------------

function findMember(name: string, memberNames: string[]): string | null {
  const wanted = name.trim().toLowerCase();
  return memberNames.find((m) => m.toLowerCase() === wanted) ?? memberNames.find((m) => m.toLowerCase().startsWith(wanted) && wanted.length >= 3) ?? null;
}

/**
 * Turns the model's description of a split into exact cents using the same
 * split functions manual entry uses. Returns null when the description cannot
 * be applied (unknown names, percentages that do not sum to 100, fixed amounts
 * above the total); callers then fall back to an equal split.
 */
export function splitInterpretationToResult(
  interpretation: SplitInterpretation,
  amountCents: number,
  memberNames: string[],
): SmartSplitResult | null {
  if (memberNames.length === 0 || amountCents <= 0) return null;
  const byMember = new Map<string, SplitShare>();
  for (const share of interpretation.shares) {
    const member = findMember(share.name, memberNames);
    if (!member) return null;
    byMember.set(member, share);
  }
  const explanation = interpretation.explanation.trim() || null;
  const suggestion = (member: string, cents: number, reason: string | null): SmartSplitResult["suggestions"][number] => ({
    member_name: member,
    share_cents: cents,
    reason,
  });

  switch (interpretation.mode) {
    case "equal": {
      const shares = equalSplit(amountCents, memberNames.length);
      return { mode: "equal", suggestions: memberNames.map((m, i) => suggestion(m, shares[i]!, null)), explanation, confidence: 1 };
    }
    case "exclude": {
      const included = memberNames.filter((m) => !(byMember.get(m)?.excluded ?? false));
      if (included.length === 0 || included.length === memberNames.length) return null;
      const shares = equalSplit(amountCents, included.length);
      return {
        mode: "custom",
        suggestions: memberNames.map((m) => {
          const idx = included.indexOf(m);
          return suggestion(m, idx >= 0 ? shares[idx]! : 0, idx >= 0 ? null : "Excluded");
        }),
        explanation,
        confidence: 1,
      };
    }
    case "percent": {
      const percents = memberNames.map((m) => (byMember.get(m)?.excluded ? 0 : byMember.get(m)?.percent ?? 0));
      const sum = percents.reduce((s, p) => s + p, 0);
      // Same tolerance percentSplit enforces, so it can never throw here.
      if (percents.some((p) => p < 0) || Math.abs(sum - 100) > 0.01) return null;
      const shares = percentSplit(amountCents, percents);
      return {
        mode: "custom",
        suggestions: memberNames.map((m, i) => suggestion(m, shares[i]!, percents[i] ? `${percents[i]}%` : "Excluded")),
        explanation,
        confidence: 1,
      };
    }
    case "shares": {
      const weights = memberNames.map((m) => (byMember.get(m)?.excluded ? 0 : byMember.get(m)?.weight ?? 1));
      if (weights.some((w) => !Number.isFinite(w) || w < 0) || weights.every((w) => w <= 0)) return null;
      const active = memberNames.filter((_, i) => weights[i]! > 0);
      const shares = sharesSplit(amountCents, weights.filter((w) => w > 0));
      return {
        mode: "custom",
        suggestions: memberNames.map((m, i) => {
          const idx = active.indexOf(m);
          return suggestion(m, idx >= 0 ? shares[idx]! : 0, idx >= 0 ? `${weights[i]} share${weights[i] === 1 ? "" : "s"}` : "Excluded");
        }),
        explanation,
        confidence: 1,
      };
    }
    case "fixed": {
      const fixed = memberNames.map((m) => {
        const share = byMember.get(m);
        if (!share || share.excluded) return share?.excluded ? 0 : null;
        return share.fixedAmount === null ? null : Math.round(share.fixedAmount * 100);
      });
      const fixedSum = fixed.reduce<number>((s, f) => s + (f ?? 0), 0);
      if (fixedSum > amountCents) return null;
      const rest = memberNames.filter((_, i) => fixed[i] === null);
      const restShares = rest.length > 0 ? equalSplit(amountCents - fixedSum, rest.length) : [];
      if (rest.length === 0 && fixedSum !== amountCents) return null;
      return {
        mode: "custom",
        suggestions: memberNames.map((m, i) => {
          const f = fixed[i] ?? null;
          if (f !== null) return suggestion(m, f, f === 0 ? "Excluded" : "Fixed amount");
          return suggestion(m, restShares[rest.indexOf(m)] ?? 0, "Shares the rest equally");
        }),
        explanation,
        confidence: 1,
      };
    }
  }
}

// -- Insights -------------------------------------------------------------------



/**
 * Renders the deterministic statistics as plain sentences. The model only
 * paraphrases these; it never sees raw expenses and never computes numbers.
 */
export function buildInsightFacts(
  groupName: string,
  insights: Omit<InsightsSummary, "llm_summary">,
  currency: CurrencyCode = "PHP",
): string {
  const peso = (minor: number): string => formatAmount(minor, currency, "en-US");
  const lines: string[] = [];
  lines.push(`Group: ${groupName}. ${insights.total_expenses} expense${insights.total_expenses === 1 ? "" : "s"} totalling ${peso(insights.total_amount_cents)}; the average expense is ${peso(insights.average_expense_cents)}.`);
  if (insights.period) lines.push(`Period: ${insights.period.first_expense.slice(0, 10)} to ${insights.period.last_expense.slice(0, 10)}.`);
  if (insights.top_spender) lines.push(`Top payer: ${insights.top_spender.name} paid ${peso(insights.top_spender.amount_cents)} in total.`);
  if (insights.most_common_item) lines.push(`Most common item: ${insights.most_common_item.name} (${insights.most_common_item.count} times).`);
  if (insights.categories.length > 0) {
    lines.push(
      "By category: " +
        insights.categories
          .slice(0, 5)
          .map((c) => `${c.name} ${peso(c.amount_cents)} (${c.expense_count} expense${c.expense_count === 1 ? "" : "s"})`)
          .join(", ") +
        ".",
    );
  }
  return lines.join("\n");
}
