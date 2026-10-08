import { assistantCommandSchema, type AssistantCommand } from "./command";
import { numberTokens } from "./text";

// ---------------------------------------------------------------------------
// Rules interpreter: the assistant on devices without Apple Intelligence, and
// the baseline the on-device model is benchmarked against. Covers common
// English and Filipino phrasings; anything else becomes "unsupported" with a
// hint, never a guess. Output goes through the same resolver as the model's.
// ---------------------------------------------------------------------------

const NAME = "([A-Z][\\p{L}'-]+(?:\\s[A-Z][\\p{L}'-]+)?|me|I|ako)";
const AMOUNT = "(?:₱|php|p|\\$|usd|€|£|¥|rm|s\\$)?\\s?(\\d[\\d,]*(?:\\.\\d+)?\\s?k?)";

const LEAD_WORDS = /^(?:record|that|so|then|and|also|pls|please|si|ni|kay|sina|nina)\s+/i;

/** Names captured case-insensitively can drag in a leading verb: "that John" → "John". */
function cleanName(raw: string | undefined): string | null {
  if (!raw) return null;
  let name = raw.trim();
  while (LEAD_WORDS.test(name)) name = name.replace(LEAD_WORDS, "");
  // Filipino particles after a name: "ni Sarah ng 500", "kay Ben sa".
  name = name.replace(/\s+(ng|sa|na|po|ay|ko|nang)$/i, "");
  return name || null;
}

function amountOf(raw: string | undefined): number {
  if (!raw) return 0;
  return numberTokens(raw)[0]?.value ?? 0;
}

function splitNames(list: string | undefined): string[] {
  if (!list) return [];
  return list
    .split(/\s*(?:,|\band\b|\bat\b|&|\bsaka\b)\s*/i)
    .map((n) => n.trim().replace(/^(si|ni|kay|sina|nina)\s+/i, ""))
    .filter((n) => n.length > 0 && !/^(the|us|everyone|all)$/i.test(n));
}

const DATE_PHRASE =
  /\b(yesterday|today|tonight|last night|kahapon|kanina|this morning|last (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)|this (?:week|month|year)|(?:on )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}|\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/i;

const FILIPINO_DATES: Record<string, string> = { kahapon: "yesterday", kanina: "today", ngayon: "today" };

/** The date phrase in a message ("yesterday", "last Friday", "kahapon" → "yesterday"), or null. */
export function dateOf(text: string): string | null {
  const match = DATE_PHRASE.exec(text);
  if (!match) return null;
  const phrase = match[1]!.toLowerCase().replace(/^on /, "");
  return FILIPINO_DATES[phrase] ?? phrase;
}

function cmd(fields: Partial<Record<keyof AssistantCommand, unknown>>): AssistantCommand {
  return assistantCommandSchema.parse(fields);
}

/**
 * Per-person parts: "Sarah 50%, Mark 30%, me 20%", "Mark owes 60% and I owe
 * 40%", "Sarah owes 1,000 and Mark owes 800", "John had 2 shares and Sarah had 1".
 */
function perPersonSplit(text: string): Pick<AssistantCommand, "splitMode" | "splitDetails"> | null {
  const part = /\b([A-Z][\p{L}'-]+|me|I|ako)\s*(?:owes?|pays?|had|has|takes?|covers?|:|-|=)?\s*(?:₱|php|\$)?\s?(\d[\d,]*(?:\.\d+)?)\s*(%|percent|shares?)?/gu;
  const found: { name: string; value: number; unit: string }[] = [];
  for (const m of text.matchAll(part)) {
    const name = m[1]!;
    if (/^(Add|Split|Paid|Spent|Bali|Group|Dinner|Lunch)$/.test(name) && name !== "I") continue;
    const value = Number(m[2]!.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    found.push({ name: /^(I|ako)$/i.test(name) ? "me" : name, value, unit: (m[3] ?? "").toLowerCase() });
  }
  const people = found.filter((f) => f.unit || /\b(owes?|pays?|had|has|takes?|covers?)\b/i.test(text));
  // Drop the total ("I paid 1,000 …") — it is the first number and belongs to the payer clause.
  const parts = people.filter((f, i) => !(i === 0 && f.name === "me" && !f.unit && /\b(i paid|i covered|nagbayad ako)\b/i.test(text)));
  if (parts.length < 2) return null;
  const percent = parts.some((p) => p.unit.startsWith("%") || p.unit === "percent");
  const shares = !percent && parts.some((p) => p.unit.startsWith("share")) || /\bshares?\b/i.test(text) && !percent;
  return {
    splitMode: percent ? "percent" : shares ? "shares" : "fixed",
    splitDetails: parts.map((p) => ({
      name: p.name,
      percent: percent ? p.value : null,
      weight: shares ? p.value : null,
      fixedAmount: !percent && !shares ? p.value : null,
    })),
  };
}

function splitFrom(text: string): Pick<AssistantCommand, "splitMode" | "splitDetails"> {
  const named = perPersonSplit(text);
  if (named) return named;
  // "60/40", "70-30"
  const ratio = /\b(\d{1,3})\s?[/-]\s?(\d{1,3})(?:\s?[/-]\s?(\d{1,3}))?\b(?!\s?(?:k|php|pesos))/i.exec(text);
  if (ratio && /\b(split|hati|hatian)\b/i.test(text)) {
    const parts = [ratio[1], ratio[2], ratio[3]].filter(Boolean).map(Number);
    const sum = parts.reduce((a, b) => a + b, 0);
    const mode = sum === 100 ? "percent" : "shares";
    return {
      splitMode: mode,
      splitDetails: parts.map((v, i) => ({ name: `#${i + 1}`, percent: mode === "percent" ? v : null, weight: mode === "shares" ? v : null, fixedAmount: null })),
    };
  }
  if (/\b(equally|evenly|hati-hati|pantay)\b/i.test(text)) return { splitMode: "equal", splitDetails: [] };
  return { splitMode: "unspecified", splitDetails: [] };
}

/** Description: words after "for"/"sa"/"para sa", trimmed at the next clause. */
function descriptionOf(text: string): string | null {
  const m =
    /\b(?:for|sa|para sa|pambayad sa)\s+(?:the\s+|our\s+|ang\s+)?([\p{L}' ]{2,40}?)(?=\s+(?:with|kasama|split|yesterday|today|kahapon|kanina|last|on|at|and|in|to|sa|,|\.|$)|[,.]|$)/iu.exec(text);
  const value = m?.[1]?.trim();
  if (!value || /^(me|us|everyone|all|lahat)$/i.test(value)) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function groupOf(text: string): string | null {
  const m = /\b(?:to|in|sa|on)\s+(?:our|the|my|ang)?\s*([\p{L}0-9']+(?:\s[\p{L}0-9']+){0,2})\s+(?:group|trip|grupo)\b/iu.exec(text);
  return m?.[1]?.trim() ?? null;
}

export function interpretWithRules(input: string): AssistantCommand {
  const text = input.trim();
  const lower = text.toLowerCase();
  const date = dateOf(text);
  const group = groupOf(text);

  if (/^(help|tulong|what can you do|ano kaya mo)/i.test(lower)) return cmd({ action: "help" });

  // Payments: "John paid me 1,500", "Record that John paid me 1500", "Binayaran ako ni John ng 500"
  let m = new RegExp(`${NAME}\\s+(?:paid|sent|gave)\\s+me\\s+(?:back\\s+)?${AMOUNT}`, "iu").exec(text);
  if (m && !/\bfor\b/i.test(text.slice(m.index + m[0].length, m.index + m[0].length + 6))) {
    return cmd({ action: "record_payment", personName: cleanName(m[1]), amount: amountOf(m[2]), direction: "they_paid_me", groupName: group });
  }
  m = new RegExp(`binayaran\\s+ako\\s+(?:ni|ng)\\s+${NAME}\\s+(?:ng\\s+)?${AMOUNT}`, "iu").exec(text);
  if (m) return cmd({ action: "record_payment", personName: cleanName(m[1]), amount: amountOf(m[2]), direction: "they_paid_me" });
  m = new RegExp(`nagbayad\\s+(?:na\\s+)?(?:si|ni)\\s+${NAME}\\s+(?:sa akin|sakin)\\s+(?:ng\\s+)?${AMOUNT}`, "iu").exec(text);
  if (m) return cmd({ action: "record_payment", personName: cleanName(m[1]), amount: amountOf(m[2]), direction: "they_paid_me", groupName: group });
  m = new RegExp(`\\bI\\s+(?:paid|sent|gave)\\s+${NAME}\\s+(?:back\\s+)?${AMOUNT}(?!.*\\bfor\\b(?!\\s+(?:what i owed|my share|my part|the balance)))`, "iu").exec(text);
  if (m && !/^(for|me)$/i.test(m[1]!)) {
    return cmd({ action: "record_payment", personName: cleanName(m[1]), amount: amountOf(m[2]), direction: "i_paid_them", groupName: group });
  }

  // "John owes me 300 for coffee", "Utang ni John 300 sa kape"
  m = new RegExp(`${NAME}\\s+owes\\s+me\\s+${AMOUNT}`, "iu").exec(text) ?? new RegExp(`utang\\s+(?:ni|sa akin ni)\\s+${NAME}\\s+(?:ay\\s+)?${AMOUNT}`, "iu").exec(text);
  if (m) {
    return cmd({ action: "add_expense", personName: cleanName(m[1]), participantNames: [cleanName(m[1]) ?? ""], amount: amountOf(m[2]), direction: "they_owe_me", description: descriptionOf(text), dateMention: date, groupName: group });
  }
  m = new RegExp(`\\bI\\s+owe\\s+${NAME}\\s+${AMOUNT}`, "iu").exec(text);
  if (m) {
    return cmd({ action: "add_expense", personName: cleanName(m[1]), amount: amountOf(m[2]), direction: "i_owe_them", description: descriptionOf(text), dateMention: date, groupName: group });
  }

  // Questions
  m = new RegExp(`how much do I owe\\s+${NAME}`, "iu").exec(text);
  if (m) return cmd({ action: "query_balance", personName: cleanName(m[1]), groupName: group });
  m = new RegExp(`how much do\\s+${NAME}\\s+and I owe each other`, "iu").exec(text) ?? new RegExp(`(?:balance|utang)\\s+(?:with|namin ni|kay)\\s+${NAME}`, "iu").exec(text);
  if (m) return cmd({ action: "query_balance", personName: cleanName(m[1]), groupName: group });
  m = new RegExp(`how much (?:does|do)\\s+${NAME}\\s+owe`, "iu").exec(text) ?? new RegExp(`magkano(?:\\s+ang)?\\s+utang\\s+(?:ni|ko kay|ko sa)\\s+${NAME}`, "iu").exec(text);
  if (m) return cmd({ action: "query_balance", personName: cleanName(m[1]), groupName: group });
  m = new RegExp(`how much do I owe\\s+${NAME}`, "iu").exec(text);
  if (m) return cmd({ action: "query_balance", personName: cleanName(m[1]), groupName: group });
  if (/\b(who owes|my balances?|balances|how much (?:do i|am i) (?:owe|owed)|sino may utang|magkano utang)\b/i.test(lower)) {
    return cmd({ action: "query_balance", groupName: group });
  }
  if (/\b(who (?:spent|paid) the most|sino (?:pinakamalaki|pinakamaraming) (?:gastos|binayad))\b/i.test(lower)) {
    return cmd({ action: "query_spending", queryKind: "top_payer", groupName: groupOf(text) ?? /\bon (?:our |the )?([\p{L} ]+?)(?: trip)?\??$/iu.exec(text)?.[1] ?? null, dateMention: date });
  }
  if (/\b(largest|biggest|most expensive|pinakamalaki)\b/i.test(lower) && !/\b(delete|remove|change|edit)\b/i.test(lower)) {
    return cmd({ action: "query_spending", queryKind: "largest", groupName: group, dateMention: date });
  }
  m = /how much did (?:we|i) spend(?: on| in| sa)?\s*(?:our|the)?\s*([\p{L} ]+?)?(?:\s+trip)?\s*(this month|last month|this week|last week|this year|today|yesterday)?\??$/iu.exec(text);
  if (m || /\b(magkano (?:ang )?(?:nagastos|ginastos|gastos))\b/i.test(lower)) {
    const scope = m?.[1]?.trim();
    return cmd({ action: "query_spending", queryKind: "total", groupName: scope && !/^(this|last)/i.test(scope) ? scope : group, dateMention: m?.[2] ?? date });
  }
  m = /^(?:find|search(?: for)?|hanapin)\s+(?:the\s+|my\s+|ang\s+)?([\p{L}' ]+?)(?:\s+expenses?)?\??$/iu.exec(text);
  if (m && !/\b(expenses|gastos|unsettled)\b/i.test(m[1]!)) {
    return cmd({ action: "query_expenses", searchText: m[1]!.trim().split(" ")[0], groupName: group, dateMention: date });
  }
  if (/\b(show|list|find|search|ipakita)\b.*\b(expenses?|gastos|unsettled|transactions?)\b/i.test(lower)) {
    const search = /\b(?:for|about|with the word)\s+"?([\p{L}]+)"?/iu.exec(text)?.[1] ?? null;
    return cmd({ action: "query_expenses", searchText: search, groupName: group, dateMention: date });
  }

  // Groups and members
  m = /\b(?:create|make|start|gumawa ng)\s+(?:a\s+)?(?:new\s+)?group\s+(?:for|called|named)?\s*(?:our\s+)?([\p{L}0-9' ]+?)(?:\s+trip)?(?:\s+with\s+(.+))?[.!]?$/iu.exec(text);
  if (m) return cmd({ action: "create_group", newName: m[1]!.trim(), participantNames: splitNames(m[2]) });
  m = new RegExp(`\\b(?:remove|kick|tanggalin)\\s+${NAME}\\s+(?:from|sa)\\s+(?:our|the)?\\s*([\\p{L}0-9' ]+?)(?:\\s+(?:group|trip))?[.!]?$`, "iu").exec(text);
  if (m) return cmd({ action: "remove_member", personName: cleanName(m[1]), groupName: m[2]!.trim() });
  m = /\b(?:add|isama)\s+(.+?)\s+(?:to|sa)\s+(?:our|the)?\s*([\p{L}0-9' ]+?)(?:\s+(?:group|trip))?[.!]?$/iu.exec(text);
  if (m && !/\d/.test(m[1]!)) return cmd({ action: "add_member", participantNames: splitNames(m[1]), groupName: m[2]!.trim() });
  m = /\brename\s+(?:our|the)?\s*([\p{L}0-9' ]+?)\s+(?:group\s+)?to\s+(.+?)[.!]?$/iu.exec(text);
  if (m) return cmd({ action: "rename_group", groupName: m[1]!.trim(), newName: m[2]!.trim() });
  if (/\b(share|link)\b.*\b(group|link)\b/i.test(lower)) return cmd({ action: "share_group", groupName: group });
  if (/\b(settings|payment details|gcash|my qr|bank details)\b/i.test(lower)) return cmd({ action: "open_settings" });

  // Edits and deletes of an existing expense
  m = /\b(?:delete|remove|burahin|tanggalin)\s+(.+?)(?:\s+expense)?[.!]?$/i.exec(text);
  if (m && /\b(delete|burahin)\b/i.test(lower) || (m && /\bexpense\b/i.test(lower))) {
    return cmd({ action: "delete_expense", targetReference: m![1]!.trim(), dateMention: date });
  }
  m = /^(?:move|ilipat)\s+(.+?)\s+(?:to|sa)\s+(.+?)[.!]?$/i.exec(text);
  if (m && DATE_PHRASE.test(m[2]!)) {
    return cmd({ action: "edit_expense", targetReference: m[1]!.trim(), dateMention: dateOf(m[2]!) });
  }
  m = /\b(?:change|update|edit|make|palitan)\s+(.+?)\s+(?:to|into|ng)\s+(.+?)[.!]?$/i.exec(text);
  if (m) {
    const target = m[1]!.trim();
    const value = m[2]!.trim();
    const amount = amountOf(value);
    return cmd({
      action: "edit_expense",
      targetReference: target,
      amount: /\d/.test(value) && !DATE_PHRASE.test(value) ? amount : 0,
      dateMention: DATE_PHRASE.test(value) ? dateOf(value) : date,
      newName: /\d/.test(value) || DATE_PHRASE.test(value) ? null : value,
    });
  }
  m = /\bsplit\s+([\p{L}' ]+?)\s+((?:\d{1,3}\s?[/-]\s?\d{1,3}.*)|(?:equally|evenly).*|(?:between|among)\s.+|.*\binstead\b.*)$/iu.exec(text);
  if (m && !/\d/.test(m[1]!) && !/^(it with|with)\b/i.test(m[1]!)) {
    const names = /\b(?:between|among)\s+(.+?)(?:\s+instead)?[.!]?$/i.exec(m[2]!)?.[1];
    return cmd({ action: "edit_expense", targetReference: m[1]!.trim(), participantNames: splitNames(names), dateMention: date, ...splitFrom(text) });
  }

  // New expenses
  const split = splitFrom(text);
  // The amount is the first number that is not a split ratio or part of a date.
  const ratioNumbers = new Set(split.splitDetails.map((d) => d.percent ?? d.weight));
  const amount = numberTokens(text.replace(DATE_PHRASE, " ").replace(/\b\d{1,3}\s?[/-]\s?\d{1,3}(?:\s?[/-]\s?\d{1,3})?\b/, " ")).find(
    (t) => t.value > 0 && !ratioNumbers.has(t.value),
  );
  const payer =
    new RegExp(`^${NAME}\\s+(?:paid|covered|nagbayad|bumili)`, "iu").exec(text)?.[1] ??
    new RegExp(`\\b(?:nagbayad|binayaran)\\s+(?:si|ni)\\s+${NAME}`, "iu").exec(text)?.[1] ??
    (/\b(i paid|i covered|nagbayad ako|ako nagbayad|ako ang nagbayad)\b/i.test(lower) ? "me" : null);
  const notAnExpense = /\b(lend|borrow|loan|pautang|hiram|convert|exchange|invest)\b/i.test(text);
  if (!notAnExpense && (amount || payer || /^(?:add|record|log|ilista)\b/i.test(text))) {
    const withList = /\b(?:with|kasama(?:\s+(?:si|sina))?|between|among|for)\s+((?:[A-Z][\p{L}'-]+|me|us)(?:(?:,|\s+and\s+|\s+at\s+|\s*&\s*)\s*(?:[A-Z][\p{L}'-]+|me))*)/u.exec(text)?.[1];
    const except = /\b(?:except|but not|maliban kay|maliban sa)\s+([A-Z][\p{L}'-]+(?:\s+and\s+[A-Z][\p{L}'-]+)*)/u.exec(text)?.[1];
    const everyone = /\b(everyone|all of us|the (?:three|four|five|two) of us|lahat|tayong lahat|the group)\b/i.test(lower);
    const description = descriptionOf(text) ?? /\b(dinner|lunch|breakfast|coffee|groceries|taxi|grab|gas|hotel|drinks|snacks)\b/i.exec(text)?.[1] ?? null;
    return cmd({
      action: "add_expense",
      amount: amount?.value ?? 0,
      payerName: payer,
      participantNames: splitNames(withList).filter((n) => !/^for$/i.test(n)),
      excludedNames: splitNames(except),
      everyone,
      description: description ? description.charAt(0).toUpperCase() + description.slice(1) : null,
      dateMention: date,
      groupName: group,
      currency: /\$|usd|dollar/i.test(text) ? "USD" : /€|eur/i.test(text) ? "EUR" : /¥|yen|jpy/i.test(text) ? "JPY" : null,
      ...split,
    });
  }

  return cmd({
    action: "unsupported",
    reply: "I didn't catch that. Try \"I paid 500 for lunch with Ana\" or \"How much does Ben owe me?\"",
  });
}
