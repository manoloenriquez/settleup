import { parsePHPAmount } from "./money";

export type ParsedExpense = {
  itemName: string;
  amountCents: number | null;
  participantNames: string[];
  raw: string;
};

/**
 * Parse a natural-language expense line into structured data.
 *
 * Format examples:
 *   "Wahunori 8703.39 split Manolo Yao"
 *   "Green Pepper 2717"
 *   "Lunch ₱1,200 Manolo Yao Alvaro"
 *
 * Rules:
 * - First numeric token (with optional leading ₱ and commas) = amount
 * - Tokens before it = itemName
 * - Optional literal "split" keyword is consumed (not part of names)
 * - Tokens after the amount (or after "split") = participantNames
 * - Empty participantNames means "all members" (caller resolves)
 */
export function parseExpenseText(input: string): ParsedExpense {
  const raw = input.trim();
  const tokens = raw.split(/\s+/);

  let amountIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const cleaned = token.replace(/[₱,]/g, "");
    const num = parseFloat(cleaned);
    if (!isNaN(num) && cleaned.length > 0) {
      amountIndex = i;
      break;
    }
  }

  if (amountIndex === -1) {
    return {
      itemName: raw,
      amountCents: null,
      participantNames: [],
      raw,
    };
  }

  const itemTokens = tokens.slice(0, amountIndex);
  const amountToken = tokens[amountIndex]!;
  const amountCents = parsePHPAmount(amountToken);

  let afterTokens = tokens.slice(amountIndex + 1);
  // consume optional "split" keyword
  if (afterTokens[0]?.toLowerCase() === "split") {
    afterTokens = afterTokens.slice(1);
  }

  return {
    itemName: itemTokens.join(" ") || raw,
    amountCents,
    participantNames: afterTokens,
    raw,
  };
}

/**
 * Fuzzy-match a name token to a member.
 * Tries case-insensitive startsWith first, then contains.
 * Returns member id or null.
 */
export function fuzzyMatchMember(
  name: string,
  members: { display_name: string; id: string }[],
): string | null {
  const lower = name.toLowerCase();
  const startsWith = members.find((m) =>
    m.display_name.toLowerCase().startsWith(lower),
  );
  if (startsWith) return startsWith.id;

  const contains = members.find((m) =>
    m.display_name.toLowerCase().includes(lower),
  );
  return contains?.id ?? null;
}
