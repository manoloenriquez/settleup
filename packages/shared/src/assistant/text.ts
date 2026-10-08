import { parseAmountInput } from "../utils/amount";
import { isCurrencyCode, type CurrencyCode } from "../utils/currency";

// ---------------------------------------------------------------------------
// Deterministic reading of the user's own words. The model reports what it
// heard; these functions check it against the text and turn it into minor
// units, currency codes and member ids.
// ---------------------------------------------------------------------------

export function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SELF = new Set(["me", "i", "myself", "my", "mine", "ako", "akin", "ko", "sakin", "sa akin", "you"]);
// "you" is how the assistant addresses the user; when a choice echoes it back it means the user.

export function isSelfWord(name: string): boolean {
  return SELF.has(normalizeName(name));
}

/** Filipino/English particles that precede names: "si Mark", "ni Ana", "kay Ben". */
function stripParticles(name: string): string {
  return normalizeName(name).replace(/^(si|ni|kay|kina|sina|nina|with|and|at|si\s+)\s+/, "");
}

type NumberToken = { raw: string; value: number };

/** Numeric tokens in the text: "2,500", "₱1,250.50", "2k", "1.5k". */
export function numberTokens(text: string): NumberToken[] {
  const cleaned = text.replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1");
  const tokens: NumberToken[] = [];
  for (const match of cleaned.matchAll(/(\d+(?:\.\d+)?)(\s?[kK]\b)?/g)) {
    const base = Number.parseFloat(match[1]!);
    if (!Number.isFinite(base)) continue;
    const value = match[2] ? base * 1000 : base;
    tokens.push({ raw: match[2] ? String(value) : match[1]!, value });
  }
  return tokens;
}

/**
 * Minor units for `amount` only when the same number appears in the user's
 * words — the model can never introduce an amount. Parsed from the user's
 * token, so no floating-point conversion of the model's number.
 */
export function amountFromText(amount: number, text: string, currency: CurrencyCode): number | null {
  if (!(amount > 0)) return null;
  const token = numberTokens(text).find((t) => Math.abs(t.value - amount) < 0.005);
  if (!token) return null;
  const minor = parseAmountInput(token.raw, currency);
  return minor !== null && minor > 0 ? minor : null;
}

const CURRENCY_WORDS: [RegExp, CurrencyCode][] = [
  [/₱|\bphp\b|\bpesos?\b|\bpiso\b/i, "PHP"],
  [/\bs\$|\bsgd\b|singapore dollars?/i, "SGD"],
  [/\bhk\$|\bhkd\b|hong kong dollars?/i, "HKD"],
  [/\ba\$|\baud\b|australian dollars?/i, "AUD"],
  [/\bnt\$|\btwd\b|taiwan dollars?/i, "TWD"],
  [/\bc\$|\bcad\b|canadian dollars?/i, "CAD"],
  [/\bnz\$|\bnzd\b/i, "NZD"],
  [/€|\beur\b|\beuros?\b/i, "EUR"],
  [/£|\bgbp\b|\bpounds?\b/i, "GBP"],
  [/\bjpy\b|\byen\b|円/i, "JPY"],
  [/\bcny\b|\brmb\b|\byuan\b|元/i, "CNY"],
  [/₩|\bkrw\b|\bwon\b/i, "KRW"],
  [/฿|\bthb\b|\bbaht\b/i, "THB"],
  [/₫|\bvnd\b|\bdong\b/i, "VND"],
  [/₹|\binr\b|\brupees?\b/i, "INR"],
  [/\bidr\b|\brupiah\b|\brp\s?\d/i, "IDR"],
  [/\bmyr\b|\bringgit\b|\brm\s?\d/i, "MYR"],
  [/\$|\busd\b|\bdollars?\b/i, "USD"],
  [/¥/i, "JPY"],
];

/** Currency the user actually named, in their text or the model's slot. */
export function currencyFromWords(slot: string | null, text: string): CurrencyCode | null {
  const upper = slot?.trim().toUpperCase() ?? "";
  for (const source of [text, slot ?? ""]) {
    for (const [pattern, code] of CURRENCY_WORDS) {
      if (pattern.test(source)) return code;
    }
  }
  // A bare ISO code only counts if the user typed it.
  if (isCurrencyCode(upper) && new RegExp(`\\b${upper}\\b`, "i").test(text)) return upper;
  return null;
}

export type MemberLike = { id: string; name: string; isMe?: boolean };

export type NameMatch =
  | { kind: "match"; id: string }
  | { kind: "ambiguous"; name: string; candidates: MemberLike[] }
  | { kind: "unknown"; name: string };

/**
 * Exact full name, then a unique first name, then a unique prefix. Two people
 * sharing a first name is ambiguous — never guessed.
 */
export function matchMember(name: string, members: readonly MemberLike[]): NameMatch {
  if (isSelfWord(name)) {
    const me = members.find((m) => m.isMe);
    return me ? { kind: "match", id: me.id } : { kind: "unknown", name };
  }
  const wanted = stripParticles(name);
  if (!wanted) return { kind: "unknown", name };
  const exact = members.filter((m) => normalizeName(m.name) === wanted);
  if (exact.length === 1) return { kind: "match", id: exact[0]!.id };
  if (exact.length > 1) return { kind: "ambiguous", name, candidates: exact };
  const first = members.filter((m) => normalizeName(m.name).split(" ")[0] === wanted);
  if (first.length === 1) return { kind: "match", id: first[0]!.id };
  if (first.length > 1) return { kind: "ambiguous", name, candidates: first };
  if (wanted.length >= 3) {
    const prefix = members.filter((m) => normalizeName(m.name).startsWith(wanted));
    if (prefix.length === 1) return { kind: "match", id: prefix[0]!.id };
    if (prefix.length > 1) return { kind: "ambiguous", name, candidates: prefix };
  }
  return { kind: "unknown", name };
}

/** True when the text names this person (so the model did not invent them). */
export function textMentions(text: string, name: string): boolean {
  if (isSelfWord(name)) return true;
  const wanted = stripParticles(name);
  if (!wanted) return false;
  const haystack = ` ${normalizeName(text)} `;
  return haystack.includes(` ${wanted} `) || haystack.includes(` ${wanted.split(" ")[0]} `);
}

/** Words that carry no meaning when matching a group name. */
const GROUP_FILLER = new Set(["our", "the", "my", "group", "trip", "grupo", "sa", "namin", "natin", "ng"]);

function groupTokens(value: string): string[] {
  return normalizeName(value)
    .split(" ")
    .filter((t) => t && !GROUP_FILLER.has(t));
}

/** Null when a group phrase is only filler ("our trip", "the group"). */
export function meaningfulGroupName(value: string | null): string | null {
  if (!value) return null;
  return groupTokens(value).length > 0 ? value : null;
}

export type GroupLike = { id: string; name: string };

/** Groups whose meaningful words all appear in what the user called it. */
export function matchGroups<T extends GroupLike>(wanted: string, groups: readonly T[]): T[] {
  const target = normalizeName(wanted);
  const exact = groups.filter((g) => normalizeName(g.name) === target);
  if (exact.length > 0) return exact;
  const wantedTokens = groupTokens(wanted);
  if (wantedTokens.length === 0) return [];
  return groups.filter((g) => {
    const tokens = groupTokens(g.name);
    if (tokens.length === 0) return false;
    return wantedTokens.every((t) => tokens.some((g2) => g2 === t || (t.length >= 4 && g2.startsWith(t))));
  });
}
