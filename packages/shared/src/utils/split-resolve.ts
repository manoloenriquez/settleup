import type { CurrencyCode } from "./currency";
import { amountToInput, formatAmount, parseAmountInput } from "./amount";
import { equalSplit, percentSplit, sharesSplit } from "./split";

/**
 * One specification for turning a split the person described into stored
 * cents, used by every add/edit form on web and mobile and by the assistant.
 *
 * The database stores only resolved minor units per participant
 * (`expense_participants.share_cents > 0`, summing to the amount); the mode is
 * how the person *entered* it. Equal splits are sent as `split_mode: "equal"`
 * and computed by the server with the same rule as {@link equalSplit} over
 * participant ids in sorted order, so the preview here sorts the same way.
 */
export type SplitMode = "equal" | "percent" | "shares" | "exact";

export type SplitShare = { memberId: string; shareCents: number };

export type SplitResolution =
  | { ok: true; mode: SplitMode; shares: SplitShare[] }
  | { ok: false; error: string };

export type ResolveSplitInput = {
  mode: SplitMode;
  totalMinor: number;
  currency: CurrencyCode;
  /** Participants in display order. */
  memberIds: string[];
  /** Per-member text input: percent, share weight or exact amount. Unused for equal. */
  values?: Record<string, string>;
  /** Display names for error messages. */
  labels?: Record<string, string>;
};

const MAX_DECIMALS = 4;

/** Non-negative decimal like "33.33" or "1.5". Null when not a plain number. */
export function parseSplitNumber(input: string): number | null {
  const text = input.trim().replace(/\s+/g, "").replace(/%$/, "");
  if (!new RegExp(`^\\d+(\\.\\d{1,${MAX_DECIMALS}})?$|^\\.\\d{1,${MAX_DECIMALS}}$`).test(text)) {
    return null;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function nameOf(input: ResolveSplitInput, memberId: string): string {
  return input.labels?.[memberId] ?? "Everyone";
}

/** Server equal-split order: ascending participant id. */
function equalShares(total: number, memberIds: string[]): SplitShare[] {
  const sorted = [...memberIds].sort();
  const cents = equalSplit(total, sorted.length);
  const byId = new Map(sorted.map((id, i) => [id, cents[i]!]));
  return memberIds.map((memberId) => ({ memberId, shareCents: byId.get(memberId)! }));
}

export function resolveSplit(input: ResolveSplitInput): SplitResolution {
  const { mode, totalMinor, currency, memberIds } = input;
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    return { ok: false, error: "Enter an amount above zero." };
  }
  if (memberIds.length === 0) return { ok: false, error: "Choose at least one person." };
  if (new Set(memberIds).size !== memberIds.length) {
    return { ok: false, error: "A person is listed twice in the split." };
  }

  let shares: SplitShare[];
  if (mode === "equal") {
    if (totalMinor < memberIds.length) {
      return { ok: false, error: "The amount is too small to split between that many people." };
    }
    shares = equalShares(totalMinor, memberIds);
  } else if (mode === "exact") {
    const amounts: number[] = [];
    for (const memberId of memberIds) {
      const parsed = parseAmountInput(input.values?.[memberId] ?? "", currency);
      if (parsed === null || parsed <= 0) {
        return { ok: false, error: `Enter an amount above zero for ${nameOf(input, memberId)}.` };
      }
      amounts.push(parsed);
    }
    const sum = amounts.reduce((a, b) => a + b, 0);
    if (sum !== totalMinor) {
      const diff = totalMinor - sum;
      return {
        ok: false,
        error:
          diff > 0
            ? `${formatAmount(diff, currency)} still needs to be assigned.`
            : `The amounts are ${formatAmount(-diff, currency)} over the total.`,
      };
    }
    shares = memberIds.map((memberId, i) => ({ memberId, shareCents: amounts[i]! }));
  } else {
    const numbers: number[] = [];
    for (const memberId of memberIds) {
      const raw = input.values?.[memberId] ?? "";
      const parsed = parseSplitNumber(raw === "" && mode === "shares" ? "1" : raw);
      if (parsed === null || parsed <= 0) {
        return {
          ok: false,
          error:
            mode === "percent"
              ? `Enter a percentage above 0 for ${nameOf(input, memberId)}.`
              : `Enter a share above 0 for ${nameOf(input, memberId)}.`,
        };
      }
      numbers.push(parsed);
    }
    if (mode === "percent") {
      // Compare in hundredths of a percent so 33.33 + 33.33 + 33.34 is exact.
      const basisPoints = numbers.reduce((a, n) => a + Math.round(n * 100), 0);
      if (Math.abs(basisPoints - 10000) > 1) {
        const total = basisPoints / 100;
        return { ok: false, error: `Percentages add up to ${total}%, not 100%.` };
      }
      shares = percentSplit(totalMinor, numbers).map((shareCents, i) => ({
        memberId: memberIds[i]!,
        shareCents,
      }));
    } else {
      shares = sharesSplit(totalMinor, numbers).map((shareCents, i) => ({
        memberId: memberIds[i]!,
        shareCents,
      }));
    }
  }

  const empty = shares.find((s) => s.shareCents <= 0);
  if (empty) {
    return {
      ok: false,
      error: `${nameOf(input, empty.memberId)}'s part rounds to ${formatAmount(0, currency)}. Raise it or remove them.`,
    };
  }
  return { ok: true, mode, shares };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Prefill text inputs for `mode` from an existing expense's stored shares, so
 * switching an edit to percent/shares/exact starts from what is saved.
 * Percentages sum to exactly 100 (hundredths distributed by largest remainder).
 */
export function splitValuesFromShares(
  mode: SplitMode,
  shares: SplitShare[],
  currency: CurrencyCode,
): Record<string, string> {
  const values: Record<string, string> = {};
  if (shares.length === 0 || mode === "equal") return values;
  if (mode === "exact") {
    for (const s of shares) values[s.memberId] = amountToInput(s.shareCents, currency);
    return values;
  }
  if (mode === "percent") {
    const basisPoints = percentSplit(
      10000,
      // Weights only need to be proportional; percentSplit wants a 100 sum.
      shares.map((s) => (s.shareCents * 100) / shares.reduce((a, b) => a + b.shareCents, 0)),
    );
    shares.forEach((s, i) => {
      const bp = basisPoints[i]!;
      values[s.memberId] = bp % 100 === 0 ? String(bp / 100) : (bp / 100).toFixed(2).replace(/0$/, "");
    });
    return values;
  }
  // The reduced ratio reproduces the stored cents exactly (sharesSplit of the
  // same total by proportional weights), however lopsided it is.
  const divisor = shares.reduce((g, s) => gcd(g, s.shareCents), 0);
  for (const s of shares) values[s.memberId] = String(s.shareCents / divisor);
  return values;
}

/**
 * Which mode reproduces stored shares: "equal" only when they are exactly what
 * the server's equal split gives these participants, otherwise "exact".
 */
export function inferSplitMode(shares: SplitShare[]): SplitMode {
  if (shares.length === 0) return "equal";
  const total = shares.reduce((a, s) => a + s.shareCents, 0);
  if (total < shares.length) return "exact";
  const equal = equalShares(
    total,
    shares.map((s) => s.memberId),
  );
  return equal.every((e, i) => e.shareCents === shares[i]!.shareCents) ? "equal" : "exact";
}
