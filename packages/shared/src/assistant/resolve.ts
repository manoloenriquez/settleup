import { amountToInput, formatAmount } from "../utils/amount";
import type { CurrencyCode } from "../utils/currency";
import { inferCategorySlug } from "../utils/category";
import { resolveDateMention } from "../utils/date-mention";
import { inferSplitMode, resolveSplit, type SplitMode, type SplitShare } from "../utils/split-resolve";
import { sharesSplit } from "../utils/split";
import type { AssistantCommand } from "./command";
import { dateOf, interpretWithRules } from "./rules";
import {
  balanceOverview,
  balanceWithPerson,
  expenseRows,
  groupBalances,
  groupLabel,
  moneyList,
  pairwiseBalance,
  rangeFromMention,
  scopedExpenses,
  spendingTotals,
  topPayers,
} from "./queries";
import {
  amountFromText,
  currencyFromWords,
  isSelfWord,
  matchGroups,
  matchMember,
  meaningfulGroupName,
  normalizeName,
  numberTokens,
  textMentions,
} from "./text";
import type {
  AssistantFocus,
  AssistantHints,
  AssistantPlan,
  AssistantSnapshot,
  ClarifyChoice,
  PreviewLine,
  ProposalAction,
  SnapshotExpense,
  SnapshotGroup,
} from "./types";

export type ResolveInput = {
  command: AssistantCommand;
  /** The user's message, verbatim. Amounts and names must come from here. */
  text: string;
  snapshot: AssistantSnapshot;
  focus: AssistantFocus;
  hints?: AssistantHints;
  /** Proposal id factory (crypto UUID in the app, deterministic in tests). */
  newId: () => string;
  /**
   * A receipt the user attached, already read by the on-device receipt
   * pipeline and reconciled deterministically (receipt-reconcile.ts). Its
   * total is trusted only when the reconciliation is verified or likely.
   */
  receipt?: AssistantReceipt;
};

export type AssistantReceipt = {
  totalMinor: number | null;
  currency: CurrencyCode | null;
  merchant: string | null;
  date: string | null;
  overall: "verified" | "likely" | "needs_review";
  issues: string[];
};

/** Plans that need more data first: the app loads it and resolves again. */
export type LoadRequest = { kind: "load"; groupIds: string[] };

type Ctx = ResolveInput & {
  hints: AssistantHints;
  /** Names substituted for "she"/"he" from the conversation; allowed although not typed. */
  pronounNames: Set<string>;
};

const MAX_CHOICES = 6;

function activeGroups(snapshot: AssistantSnapshot): SnapshotGroup[] {
  return snapshot.groups.filter((g) => !g.archived && g.myMemberId);
}

function memberName(group: SnapshotGroup, memberId: string): string {
  const member = group.members.find((m) => m.id === memberId);
  if (!member) return "Someone";
  return member.isMe ? "You" : member.name;
}

function asMembers(group: SnapshotGroup): { id: string; name: string; isMe: boolean }[] {
  return group.members.map((m) => ({ id: m.id, name: m.name, isMe: m.isMe }));
}

function money(minor: number, currency: CurrencyCode): string {
  return formatAmount(minor, currency);
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** Names the model reported that the user actually wrote. Invented names are dropped. */
function mentioned(ctx: Ctx, names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (!textMentions(ctx.text, name) && !(name in (ctx.hints.memberIds ?? {})) && !ctx.pronounNames.has(normalizeName(name))) continue;
    // Keep the name as the user typed it: "John" stays "John" even if the
    // interpreter expanded it to "John Cruz" from context, so ambiguity is asked.
    const typed = typedForm(ctx.text, name);
    const key = isSelfWord(typed) ? "__me" : normalizeName(typed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(typed);
  }
  return out;
}

function typedForm(text: string, name: string): string {
  if (isSelfWord(name)) return name;
  const full = normalizeName(name);
  const haystack = ` ${normalizeName(text)} `;
  if (haystack.includes(` ${full} `)) return name;
  const first = name.trim().split(/\s+/)[0] ?? name;
  return haystack.includes(` ${normalizeName(first)} `) ? first : name;
}

function personNames(ctx: Ctx): string[] {
  const c = ctx.command;
  return mentioned(ctx, [...(c.personName ? [c.personName] : []), ...c.participantNames, ...(c.payerName ? [c.payerName] : []), ...c.splitDetails.map((d) => d.name)]).filter(
    (n) => !isSelfWord(n),
  );
}

function groupChoices(groups: SnapshotGroup[]): ClarifyChoice[] {
  return groups.slice(0, MAX_CHOICES).map((g) => ({ label: groupLabel(g), hints: { groupId: g.id } }));
}

type GroupScope =
  | { kind: "group"; group: SnapshotGroup }
  | { kind: "personal" }
  | { kind: "plan"; plan: AssistantPlan };

/** Which group a request is about: tapped choice, named group, focus, or the one group everyone named is in. */
function resolveGroupScope(ctx: Ctx, options: { allowPersonal: boolean; purpose: string }): GroupScope {
  const groups = activeGroups(ctx.snapshot);
  if (ctx.hints.personal && options.allowPersonal) return { kind: "personal" };
  if (ctx.hints.groupId) {
    const group = groups.find((g) => g.id === ctx.hints.groupId);
    if (group) return { kind: "group", group };
  }
  const named = ctx.command.groupName;
  if (named && textMentions(ctx.text, named.split(" ").filter((w) => !/^(our|the|my)$/i.test(w))[0] ?? named)) {
    const byName = matchGroups(named, groups);
    const byFriend = groups.filter((g) => g.isDirect && g.friendName && normalizeName(g.friendName) === normalizeName(named));
    const matches = byName.length ? byName : byFriend;
    if (matches.length === 1) return { kind: "group", group: matches[0]! };
    if (matches.length > 1) {
      return { kind: "plan", plan: { kind: "clarify", text: `Which "${named}" ${options.purpose}?`, choices: groupChoices(matches) } };
    }
    return {
      kind: "plan",
      plan: {
        kind: "clarify",
        text: `I couldn't find a group called "${named}". Which one ${options.purpose}?`,
        choices: groupChoices(groups),
      },
    };
  }
  const people = personNames(ctx);
  if (people.length === 0) {
    const focus = groups.find((g) => g.id === ctx.focus.groupId);
    const wantsGroup =
      ctx.command.everyone || ctx.command.splitMode !== "unspecified" || /\b(we|us|our|natin|namin|tayo|kami|group|grupo)\b/i.test(ctx.text);
    if (options.allowPersonal && !wantsGroup) return { kind: "personal" };
    if (focus) return { kind: "group", group: focus };
    if (groups.length === 1) return { kind: "group", group: groups[0]! };
    if (groups.length === 0) {
      return { kind: "plan", plan: { kind: "refuse", text: "You don't have any groups yet.", route: { screen: "new_group" } } };
    }
    const choices = groupChoices(groups);
    if (options.allowPersonal) choices.push({ label: "Just me (personal)", hints: { personal: true } });
    return { kind: "plan", plan: { kind: "clarify", text: `Which group ${options.purpose}?`, choices } };
  }
  const candidates = groups.filter((g) => people.every((name) => matchMember(name, asMembers(g)).kind !== "unknown"));
  const focus = candidates.find((g) => g.id === ctx.focus.groupId);
  if (focus) return { kind: "group", group: focus };
  if (candidates.length === 1) return { kind: "group", group: candidates[0]! };
  if (candidates.length > 1) {
    // One person who is also a friend: their direct ledger is the natural home,
    // but only when no shared group was mentioned — still ask, direct first.
    const sorted = [...candidates].sort((a, b) => Number(b.isDirect) - Number(a.isDirect));
    return { kind: "plan", plan: { kind: "clarify", text: `${people.join(" and ")} ${people.length > 1 ? "are" : "is"} in more than one group. Which one ${options.purpose}?`, choices: groupChoices(sorted) } };
  }
  const unknown = people.filter((name) => !groups.some((g) => matchMember(name, asMembers(g)).kind !== "unknown"));
  if (unknown.length > 0) {
    return {
      kind: "plan",
      plan: {
        kind: "refuse",
        text: `I don't see ${unknown.join(" or ")} in any of your groups. Add them to a group first, then ask again.`,
      },
    };
  }
  return {
    kind: "plan",
    plan: { kind: "clarify", text: `${people.join(" and ")} aren't in one group together. Which group ${options.purpose}?`, choices: groupChoices(groups) },
  };
}

type PeopleResult = { kind: "ok"; ids: string[] } | { kind: "plan"; plan: AssistantPlan };

function resolvePeople(ctx: Ctx, group: SnapshotGroup, names: string[]): PeopleResult {
  const ids: string[] = [];
  for (const name of names) {
    const hinted = ctx.hints.memberIds?.[name];
    if (hinted && group.members.some((m) => m.id === hinted)) {
      if (!ids.includes(hinted)) ids.push(hinted);
      continue;
    }
    const match = matchMember(name, asMembers(group));
    if (match.kind === "match") {
      if (!ids.includes(match.id)) ids.push(match.id);
    } else if (match.kind === "ambiguous") {
      return {
        kind: "plan",
        plan: {
          kind: "clarify",
          text: `Which ${capitalize(name)}?`,
          choices: match.candidates.slice(0, MAX_CHOICES).map((c) => ({
            label: c.name,
            hints: { groupId: group.id, memberIds: { ...(ctx.hints.memberIds ?? {}), [name]: c.id } },
          })),
        },
      };
    } else {
      return {
        kind: "plan",
        plan: {
          kind: "refuse",
          text: `There's no ${capitalize(name)} in ${groupLabel(group)}. Add them to the group first.`,
          route: { screen: "group_settings", groupId: group.id },
        },
      };
    }
  }
  return { kind: "ok", ids };
}

const DATE_SYNONYMS: Record<string, RegExp> = {
  yesterday: /\b(kahapon|yesterday)\b/i,
  today: /\b(ngayon|kanina|today)\b/i,
  "last night": /\b(kagabi|last night)\b/i,
};

/** The date phrase must be in the user's words (or its Filipino equivalent). */
function dateWasSaid(mention: string, text: string): boolean {
  const key = mention.trim().toLowerCase();
  if (DATE_SYNONYMS[key]?.test(text)) return true;
  return textMentions(text, mention.split(" ")[0] ?? mention);
}

function resolveDate(ctx: Ctx): { kind: "ok"; date: string } | { kind: "plan"; plan: AssistantPlan } {
  const mention = ctx.command.dateMention;
  if (!mention || !dateWasSaid(mention, ctx.text)) return { kind: "ok", date: ctx.snapshot.today };
  // A period ("this month") is not a day; a new expense in it is dated today.
  if (/^(this|ngayong) (month|week|year|buwan|linggo|taon)$/i.test(mention.trim())) return { kind: "ok", date: ctx.snapshot.today };
  const date = resolveDateMention(mention, ctx.snapshot.today);
  if (date) return { kind: "ok", date };
  return { kind: "plan", plan: { kind: "clarify", text: `Which date is "${mention}"? Try "yesterday" or "Oct 3".`, choices: [] } };
}

function askAmount(ctx: Ctx, what: string): AssistantPlan {
  return {
    kind: "clarify",
    text: ctx.command.amount > 0 ? `I couldn't find that amount in your message. How much was ${what}?` : `How much was ${what}?`,
    choices: [],
  };
}

function lineForShares(group: SnapshotGroup, shares: SplitShare[], currency: CurrencyCode): string {
  return shares.map((s) => `${memberName(group, s.memberId)} ${money(s.shareCents, currency)}`).join(", ");
}

const SPLIT_MODE: Record<AssistantCommand["splitMode"], SplitMode> = {
  unspecified: "equal",
  equal: "equal",
  percent: "percent",
  shares: "shares",
  fixed: "exact",
};

type SplitResult = { kind: "ok"; mode: SplitMode; shares: SplitShare[] } | { kind: "plan"; plan: AssistantPlan };

/** Turns the stated split into resolved shares with the shared resolver. */
function resolveStatedSplit(ctx: Ctx, group: SnapshotGroup, participantIds: string[], totalMinor: number, currency: CurrencyCode): SplitResult {
  const mode = SPLIT_MODE[ctx.command.splitMode];
  const details = ctx.command.splitDetails;
  if (mode === "equal" || details.length === 0) {
    const r = resolveSplit({ mode: "equal", totalMinor, currency, memberIds: participantIds });
    return r.ok ? { kind: "ok", mode: "equal", shares: r.shares } : { kind: "plan", plan: { kind: "clarify", text: r.error, choices: [] } };
  }
  const tokens = numberTokens(ctx.text);
  const stated = (value: number | null): boolean => value !== null && tokens.some((t) => Math.abs(t.value - value) < 0.005);
  const raw = details.map((d) => (mode === "percent" ? d.percent : mode === "shares" ? d.weight : d.fixedAmount));
  if (raw.some((v) => !stated(v))) {
    return { kind: "plan", plan: { kind: "clarify", text: "I couldn't match those split numbers to your message. How should it be split?", choices: [] } };
  }
  const values: Record<string, string> = {};
  const namesWritten = details.every((d) => textMentions(ctx.text, d.name));
  if (namesWritten) {
    const people = resolvePeople(ctx, group, details.map((d) => d.name));
    if (people.kind === "plan") return people;
    people.ids.forEach((id, i) => {
      values[id] = String(raw[i]!);
    });
    // Exact amounts must be the user's tokens: re-read them from the text.
    if (mode === "exact") {
      for (const [i, id] of people.ids.entries()) {
        const minor = amountFromText(raw[i]!, ctx.text, currency);
        if (minor === null) return { kind: "plan", plan: { kind: "clarify", text: "How much does each person owe?", choices: [] } };
        values[id] = amountToInput(minor, currency);
      }
    }
    const r = resolveSplit({ mode, totalMinor, currency, memberIds: people.ids, values, labels: Object.fromEntries(group.members.map((m) => [m.id, m.isMe ? "You" : m.name])) });
    return r.ok ? { kind: "ok", mode, shares: r.shares } : { kind: "plan", plan: { kind: "clarify", text: r.error, choices: [] } };
  }
  // "60/40" with no names: never guess who pays which part.
  if (participantIds.length !== raw.length) {
    return { kind: "plan", plan: { kind: "clarify", text: `Who pays which part of the ${raw.join("/")} split?`, choices: [] } };
  }
  const first = ctx.hints.firstShareMemberId;
  if (!first || !participantIds.includes(first)) {
    const unit = mode === "percent" ? "%" : mode === "shares" ? " shares" : "";
    return {
      kind: "plan",
      plan: {
        kind: "clarify",
        text: `Who pays the ${raw[0]}${unit} part?`,
        choices: participantIds.map((id) => ({ label: memberName(group, id), hints: { ...ctx.hints, groupId: group.id, firstShareMemberId: id } })),
      },
    };
  }
  const ordered = [first, ...participantIds.filter((id) => id !== first)];
  ordered.forEach((id, i) => {
    values[id] = String(raw[i]!);
  });
  if (mode === "exact") {
    for (const [i, id] of ordered.entries()) {
      const minor = amountFromText(raw[i]!, ctx.text, currency);
      if (minor === null) return { kind: "plan", plan: { kind: "clarify", text: "How much does each person owe?", choices: [] } };
      values[id] = amountToInput(minor, currency);
    }
  }
  const r = resolveSplit({ mode, totalMinor, currency, memberIds: ordered, values, labels: Object.fromEntries(group.members.map((m) => [m.id, m.isMe ? "You" : m.name])) });
  return r.ok ? { kind: "ok", mode, shares: r.shares } : { kind: "plan", plan: { kind: "clarify", text: r.error, choices: [] } };
}

/**
 * The user described per-person parts ("Sarah pays 600", "owes 60%", "2 shares")
 * but the interpreter returned none: never fall back to an equal split.
 */
function unparsedSplit(ctx: Ctx): boolean {
  const c = ctx.command;
  if (c.splitDetails.length > 0 && c.splitMode !== "unspecified" && c.splitMode !== "equal") return false;
  const text = ctx.text.replace(/\bowes? me\b[^,.]*/gi, " ");
  return /\d+(?:\.\d+)?\s?%|\b(?:pays?|owes?|owe|covers?|had|takes?)\s+(?:₱|php|\$)?\s?\d|\b\d+\s+shares?\b/i.test(text);
}

/**
 * The description only counts when the user wrote one of its words; the model
 * may tidy "grab pauwi" into "Grab ride" but may not invent "Team dinner".
 */
function describedInText(description: string | null, text: string): string | null {
  const value = description?.trim();
  if (!value) return null;
  const said = new Set(normalizeName(text).split(" "));
  const words = normalizeName(value).split(" ").filter((w) => w.length >= 3);
  return words.some((w) => said.has(w) || [...said].some((s) => s.length >= 4 && w.startsWith(s.slice(0, 4)))) ? value : null;
}

function fallbackDescription(text: string): string | null {
  const fromRules = interpretWithRules(text).description;
  return fromRules && describedInText(fromRules, text) ? fromRules : null;
}

function canEditExpense(group: SnapshotGroup, expense: SnapshotExpense): boolean {
  return expense.createdByMe || group.myRole === "owner" || group.myRole === "admin";
}

function isAdmin(group: SnapshotGroup): boolean {
  return group.myRole === "owner" || group.myRole === "admin";
}

// ---------------------------------------------------------------------------
// add_expense
// ---------------------------------------------------------------------------

function addExpense(ctx: Ctx): AssistantPlan {
  const c = ctx.command;
  const owes = c.direction === "they_owe_me" || c.direction === "i_owe_them";
  if (ctx.snapshot.isGuest && (personNames(ctx).length > 0 || c.groupName)) {
    return {
      kind: "refuse",
      text: "Splitting with other people needs an account. I can add it as your own expense, or you can sign in to share it.",
      route: { screen: "sign_in" },
    };
  }
  const scope = ctx.snapshot.isGuest
    ? ({ kind: "personal" } as GroupScope)
    : resolveGroupScope(ctx, { allowPersonal: !owes, purpose: "is this for" });
  if (scope.kind === "plan") return scope.plan;
  const stated = currencyFromWords(c.currency, ctx.text);
  const receipt = ctx.receipt;
  if (receipt && (receipt.overall === "needs_review" || receipt.totalMinor === null)) {
    return {
      kind: "clarify",
      text: `I read the receipt, but some numbers need checking${receipt.issues[0] ? ` (${receipt.issues[0]})` : ""}. What's the total? You can also open the receipt editor to fix line items.`,
      choices: [],
    };
  }
  const date = receipt?.date && !c.dateMention ? { kind: "ok" as const, date: receipt.date } : resolveDate(ctx);
  if (date.kind === "plan") return date.plan;
  const description = describedInText(c.description, ctx.text) ?? receipt?.merchant?.trim() ?? fallbackDescription(ctx.text) ?? "Expense";
  /** A trusted receipt total, or the amount the user typed. */
  const amountIn = (currency: CurrencyCode): number | null =>
    receipt?.totalMinor && (receipt.currency === null || receipt.currency === currency) ? receipt.totalMinor : amountFromText(c.amount, ctx.text, currency);
  const receiptCurrency = receipt?.currency ?? null;

  if (scope.kind === "personal") {
    const currency = receiptCurrency ?? stated ?? ctx.snapshot.defaultCurrency;
    const amountMinor = amountIn(currency);
    if (amountMinor === null) return askAmount(ctx, description === "Expense" ? "it" : description.toLowerCase());
    if (description === "Expense" && !receipt && !/\b(spent|spend|paid|bought|gastos|gumastos|binili|nagbayad)\b/i.test(ctx.text)) {
      return { kind: "clarify", text: `What was the ${money(amountMinor, currency)} for?`, choices: [] };
    }
    const category = inferCategorySlug(description) ?? "other";
    return {
      kind: "propose",
      text: "Here's the expense. Save it?",
      proposal: {
        id: ctx.newId(),
        risk: "write",
        title: "Add personal expense",
        lines: [
          { label: "What", value: description },
          { label: "Amount", value: money(amountMinor, currency) + (receipt ? ` · from receipt (${receipt.overall})` : "") },
          { label: "Date", value: date.date },
        ],
        action: { type: "add_personal_expense", description, amountMinor, currency, date: date.date, category },
        requiresConnection: false,
      },
    };
  }

  const group = scope.group;
  const currency = receiptCurrency ?? stated ?? group.currency;
  const amountMinor = amountIn(currency);
  if (amountMinor === null) return askAmount(ctx, description === "Expense" ? "it" : description.toLowerCase());
  const me = group.myMemberId!;
  const person = mentioned(ctx, [...(c.personName ? [c.personName] : []), ...c.participantNames]).filter((n) => !isSelfWord(n));

  // Payer
  let payerId = me;
  if (ctx.hints.payerMemberId && group.members.some((m) => m.id === ctx.hints.payerMemberId)) payerId = ctx.hints.payerMemberId;
  else if (c.direction === "i_owe_them") {
    const r = resolvePeople(ctx, group, person.slice(0, 1));
    if (r.kind === "plan") return r.plan;
    if (r.ids[0]) payerId = r.ids[0];
  } else if (c.payerName && textMentions(ctx.text, c.payerName) && c.direction !== "they_owe_me") {
    const r = resolvePeople(ctx, group, [c.payerName]);
    if (r.kind === "plan") return r.plan;
    payerId = r.ids[0] ?? me;
  }

  // Participants
  let participantIds: string[];
  if (c.direction === "they_owe_me") {
    const r = resolvePeople(ctx, group, person.length ? person : []);
    if (r.kind === "plan") return r.plan;
    if (r.ids.length === 0) return { kind: "clarify", text: "Who owes you?", choices: [] };
    participantIds = r.ids;
  } else if (c.direction === "i_owe_them") {
    participantIds = [me];
  } else {
    const named = mentioned(ctx, c.participantNames);
    const details = c.splitDetails.filter((d) => textMentions(ctx.text, d.name)).map((d) => d.name);
    const names = [...named, ...details.filter((d) => !named.includes(d))];
    if (c.everyone || names.length === 0) {
      participantIds = group.members.map((m) => m.id);
    } else {
      const r = resolvePeople(ctx, group, names);
      if (r.kind === "plan") return r.plan;
      participantIds = r.ids;
      // "I paid for dinner with John and Sarah" includes me.
      if (payerId === me && !participantIds.includes(me) && /\b(with|kasama|together)\b/i.test(ctx.text)) participantIds.unshift(me);
      if (!participantIds.includes(payerId) && /\b(us|we|tayo|kami|natin|namin)\b/i.test(ctx.text)) participantIds.unshift(payerId);
    }
    const excluded = mentioned(ctx, c.excludedNames);
    if (excluded.length) {
      const r = resolvePeople(ctx, group, excluded);
      if (r.kind === "plan") return r.plan;
      participantIds = participantIds.filter((id) => !r.ids.includes(id));
    }
  }
  // Keep the group's member order for a stable preview.
  const order = group.members.map((m) => m.id);
  participantIds = order.filter((id) => participantIds.includes(id));
  if (participantIds.length === 0) return { kind: "clarify", text: "Who should share this?", choices: [] };
  if (participantIds.length === 1 && participantIds[0] === payerId) {
    return {
      kind: "clarify",
      text: `That would only involve ${memberName(group, payerId).toLowerCase() === "you" ? "you" : memberName(group, payerId)}. Who else shares it — or is it a personal expense?`,
      choices: [{ label: "Personal expense", hints: { personal: true } }],
    };
  }

  if (unparsedSplit(ctx)) {
    return { kind: "clarify", text: "I couldn't follow that split. Say it like \"Ana 60%, me 40%\" or \"Ana 600, me 400\".", choices: [] };
  }
  const split = resolveStatedSplit(ctx, group, participantIds, amountMinor, currency);
  if (split.kind === "plan") return split.plan;

  const lines: PreviewLine[] = [
    { label: "Group", value: groupLabel(group) },
    { label: "What", value: description },
    { label: "Amount", value: money(amountMinor, currency) + (receipt ? ` · from receipt (${receipt.overall})` : "") },
    { label: "Paid by", value: memberName(group, payerId) },
    { label: split.mode === "equal" ? "Split equally" : "Split", value: lineForShares(group, split.shares, currency) },
    { label: "Date", value: date.date },
  ];
  return {
    kind: "propose",
    text: "Here's what I'll add. Look right?",
    proposal: {
      id: ctx.newId(),
      risk: "write",
      title: "Add expense",
      lines,
      action: {
        type: "add_group_expense",
        groupId: group.id,
        description,
        amountMinor,
        currency,
        date: date.date,
        payerMemberId: payerId,
        splitMode: split.mode,
        shares: split.shares,
      },
      requiresConnection: false,
    },
    focus: { groupId: group.id, memberIds: participantIds },
  };
}

// ---------------------------------------------------------------------------
// Finding an existing expense
// ---------------------------------------------------------------------------

const REFERENCE_WORDS = /^(that|it|this|that one|this one|yan|iyan|iyon|yun|yung|that expense|the expense)$/i;
const DATE_WORDS = /\b(yesterday|today|tonight|last|this|kahapon|kanina|monday|tuesday|wednesday|thursday|friday|saturday|sunday|'s)\b/gi;

type TargetResult = { kind: "ok"; expense: SnapshotExpense; group: SnapshotGroup } | { kind: "plan"; plan: AssistantPlan };

function findTarget(ctx: Ctx, useDateAsFilter: boolean): TargetResult {
  const groups = activeGroups(ctx.snapshot);
  const all = groups.flatMap((group) => (group.expenses ?? []).map((expense) => ({ expense, group })));
  if (ctx.hints.expenseId) {
    const hit = all.find((e) => e.expense.id === ctx.hints.expenseId);
    if (hit) return { kind: "ok", ...hit };
  }
  const ref = (ctx.command.targetReference ?? "").trim();
  let pool = all;
  const named = ctx.command.groupName ? matchGroups(ctx.command.groupName, groups) : [];
  if (named.length === 1) pool = pool.filter((e) => e.group.id === named[0]!.id);
  if ((!ref || REFERENCE_WORDS.test(ref)) && ctx.focus.expenseIds.length > 0) {
    const hit = all.find((e) => e.expense.id === ctx.focus.expenseIds[0]);
    if (hit) return { kind: "ok", ...hit };
  }
  if (/\b(largest|biggest|most expensive|pinakamalaki)\b/i.test(ref)) {
    const scoped = ctx.focus.groupId ? pool.filter((e) => e.group.id === ctx.focus.groupId) : pool;
    const top = [...scoped].sort((a, b) => b.expense.amountMinor - a.expense.amountMinor)[0];
    if (top) return { kind: "ok", ...top };
  }
  if (/\b(last|latest|most recent|huli)\b/i.test(ref) && !/\b(last (night|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(ref)) {
    const scoped = ctx.focus.groupId ? pool.filter((e) => e.group.id === ctx.focus.groupId) : pool;
    const recent = [...scoped].sort((a, b) => b.expense.createdAt.localeCompare(a.expense.createdAt)).filter((e) => e.expense.createdByMe)[0];
    if (recent) return { kind: "ok", ...recent };
  }
  const words = normalizeName(ref.replace(DATE_WORDS, " "))
    .split(" ")
    .filter((w) => w.length >= 3 && !["the", "our", "my", "that", "expense", "ang", "yung"].includes(w));
  let candidates = words.length
    ? pool.filter((e) => words.some((w) => normalizeName(e.expense.description).includes(w)))
    : [];
  if (useDateAsFilter && ctx.command.dateMention) {
    const day = resolveDateMention(ctx.command.dateMention, ctx.snapshot.today);
    if (day) {
      const onDay = (candidates.length ? candidates : words.length ? [] : pool).filter((e) => e.expense.date === day);
      candidates = onDay;
    }
  }
  if (candidates.length === 1) return { kind: "ok", ...candidates[0]! };
  if (candidates.length > 1) {
    return {
      kind: "plan",
      plan: {
        kind: "clarify",
        text: "Which one?",
        choices: candidates.slice(0, MAX_CHOICES).map(({ expense, group }) => ({
          label: `${expense.description} · ${money(expense.amountMinor, expense.currency)} · ${expense.date} · ${groupLabel(group)}`,
          hints: { ...ctx.hints, expenseId: expense.id, groupId: group.id },
        })),
      },
    };
  }
  return {
    kind: "plan",
    plan: { kind: "refuse", text: "I couldn't find that expense in what's loaded. Try its name, like \"the Grab ride\", or open the group." },
  };
}

function scalePayers(expense: SnapshotExpense, newTotal: number): { memberId: string; amountMinor: number }[] | null {
  if (expense.payers.length === 1) return [{ memberId: expense.payers[0]!.memberId, amountMinor: newTotal }];
  if (newTotal < expense.payers.length) return null;
  const scaled = sharesSplit(newTotal, expense.payers.map((p) => p.amountMinor));
  if (scaled.some((v) => v <= 0)) return null;
  return expense.payers.map((p, i) => ({ memberId: p.memberId, amountMinor: scaled[i]! }));
}

function editExpense(ctx: Ctx): AssistantPlan {
  if (ctx.snapshot.isGuest) return guestGroupRefusal();
  const c = ctx.command;
  const wantsNewDate = /\b(date|petsa|move|moved|ilipat|change (it|the date) to)\b/i.test(ctx.text);
  const target = findTarget(ctx, !wantsNewDate);
  if (target.kind === "plan") return target.plan;
  const { expense, group } = target;
  if (!canEditExpense(group, expense)) {
    return { kind: "refuse", text: "Only the person who added this expense or a group admin can change it.", route: { screen: "group", groupId: group.id } };
  }
  if (expense.itemized) {
    return { kind: "refuse", text: "This expense is itemized. Edit its line items from the group screen.", route: { screen: "group", groupId: group.id } };
  }
  const currency = expense.currency;
  const stated = currencyFromWords(c.currency, ctx.text);
  if (stated && stated !== currency) {
    return { kind: "refuse", text: `This expense is in ${currency}. An expense's currency can't be changed — delete it and add it again in ${stated}.` };
  }
  let amountMinor = expense.amountMinor;
  if (c.amount > 0) {
    const parsed = amountFromText(c.amount, ctx.text, currency);
    if (parsed === null) return askAmount(ctx, "it");
    amountMinor = parsed;
  }
  let date = expense.date;
  if (wantsNewDate && c.dateMention) {
    const d = resolveDate(ctx);
    if (d.kind === "plan") return d.plan;
    date = d.date;
  }
  const description = c.newName && textMentions(ctx.text, c.newName.split(" ")[0] ?? c.newName) ? c.newName : expense.description;

  const splitChanged = c.splitMode !== "unspecified" || mentioned(ctx, c.participantNames).length > 0 || c.splitDetails.length > 0;
  let mode: SplitMode;
  let shares: SplitShare[];
  if (splitChanged) {
    const named = mentioned(ctx, [...c.participantNames, ...c.splitDetails.map((d) => d.name)]);
    let participantIds = expense.shares.map((s) => s.memberId);
    if (named.length > 0 && !c.everyone) {
      const r = resolvePeople(ctx, group, named);
      if (r.kind === "plan") return r.plan;
      participantIds = group.members.map((m) => m.id).filter((id) => r.ids.includes(id));
    } else if (c.everyone) {
      participantIds = group.members.map((m) => m.id);
    }
    const r = resolveStatedSplit({ ...ctx, hints: { ...ctx.hints, groupId: group.id, expenseId: expense.id } }, group, participantIds, amountMinor, currency);
    if (r.kind === "plan") return r.plan;
    mode = r.mode;
    shares = r.shares;
  } else if (amountMinor !== expense.amountMinor) {
    if (inferSplitMode(expense.shares) === "equal") {
      const r = resolveSplit({ mode: "equal", totalMinor: amountMinor, currency, memberIds: expense.shares.map((s) => s.memberId) });
      if (!r.ok) return { kind: "clarify", text: r.error, choices: [] };
      mode = "equal";
      shares = r.shares;
    } else {
      const values = Object.fromEntries(expense.shares.map((s) => [s.memberId, String(s.shareCents)]));
      const r = resolveSplit({ mode: "shares", totalMinor: amountMinor, currency, memberIds: expense.shares.map((s) => s.memberId), values });
      if (!r.ok) return { kind: "clarify", text: r.error, choices: [] };
      mode = "exact";
      shares = r.shares;
    }
  } else {
    mode = inferSplitMode(expense.shares);
    shares = expense.shares;
  }

  const nothingChanged =
    amountMinor === expense.amountMinor &&
    date === expense.date &&
    description === expense.description &&
    shares.length === expense.shares.length &&
    shares.every((s) => expense.shares.some((o) => o.memberId === s.memberId && o.shareCents === s.shareCents));
  if (nothingChanged) return { kind: "clarify", text: `What should I change about "${expense.description}"?`, choices: [] };

  const payers = scalePayers(expense, amountMinor);
  if (!payers) return { kind: "clarify", text: "That amount is too small to keep who paid what.", choices: [] };

  const lines: PreviewLine[] = [{ label: "Expense", value: `${expense.description} · ${groupLabel(group)}` }];
  if (description !== expense.description) lines.push({ label: "Name", before: expense.description, value: description });
  if (amountMinor !== expense.amountMinor) lines.push({ label: "Amount", before: money(expense.amountMinor, currency), value: money(amountMinor, currency) });
  if (date !== expense.date) lines.push({ label: "Date", before: expense.date, value: date });
  lines.push({ label: "Split", before: lineForShares(group, expense.shares, currency), value: lineForShares(group, shares, currency) });

  return {
    kind: "propose",
    text: "Here's the change. Save it?",
    proposal: {
      id: ctx.newId(),
      risk: amountMinor !== expense.amountMinor || splitChanged ? "consequential" : "write",
      title: "Change expense",
      lines,
      action: {
        type: "edit_group_expense",
        groupId: group.id,
        expenseId: expense.id,
        expectedUpdatedAt: expense.updatedAt,
        description,
        amountMinor,
        currency,
        date,
        splitMode: mode,
        shares,
        payers,
        categoryId: expense.categoryId,
        notes: expense.notes,
      },
      requiresConnection: false,
    },
    focus: { groupId: group.id, expenseIds: [expense.id] },
  };
}

function deleteExpense(ctx: Ctx): AssistantPlan {
  if (ctx.snapshot.isGuest) return guestGroupRefusal();
  const target = findTarget(ctx, true);
  if (target.kind === "plan") return target.plan;
  const { expense, group } = target;
  if (!canEditExpense(group, expense)) {
    return { kind: "refuse", text: "Only the person who added this expense or a group admin can delete it." };
  }
  return {
    kind: "propose",
    text: "Delete this expense? Everyone's balances in the group will change.",
    proposal: {
      id: ctx.newId(),
      risk: "consequential",
      title: "Delete expense",
      lines: [
        { label: "Expense", value: expense.description },
        { label: "Amount", value: money(expense.amountMinor, expense.currency) },
        { label: "Group", value: groupLabel(group) },
        { label: "Date", value: expense.date },
      ],
      action: { type: "delete_group_expense", groupId: group.id, expenseId: expense.id, expectedUpdatedAt: expense.updatedAt },
      // Deletes have no server-side conflict check; the app re-reads the
      // expense right before deleting, which needs a connection.
      requiresConnection: true,
    },
    focus: { groupId: group.id, expenseIds: [expense.id] },
  };
}

// ---------------------------------------------------------------------------
// record_payment
// ---------------------------------------------------------------------------

function recordPayment(ctx: Ctx): AssistantPlan {
  if (ctx.snapshot.isGuest) return guestGroupRefusal();
  const c = ctx.command;
  const people = personNames(ctx);
  if (people.length === 0) return { kind: "clarify", text: "Who was the payment with?", choices: [] };
  let direction: "they_paid_me" | "i_paid_them" | null = ctx.hints.direction ?? null;
  if (!direction) {
    if (/\b(paid me|pay me|sent me|gave me|binayaran (ako|niya ako)|nagbayad (na )?(sa akin|sakin)|bayad (na )?sa akin)\b/i.test(ctx.text)) direction = "they_paid_me";
    else if (/\b(i paid|i sent|i gave|nagbayad ako|binayaran ko)\b/i.test(ctx.text)) direction = "i_paid_them";
    else if (c.direction === "they_paid_me" || c.direction === "i_paid_them") direction = c.direction;
  }
  const scope = resolveGroupScope(ctx, { allowPersonal: false, purpose: "was this payment for" });
  if (scope.kind === "plan") return scope.plan;
  if (scope.kind === "personal") return { kind: "clarify", text: "Which group was this payment for?", choices: groupChoices(activeGroups(ctx.snapshot)) };
  const group = scope.group;
  const r = resolvePeople(ctx, group, people.slice(0, 1));
  if (r.kind === "plan") return r.plan;
  const otherId = r.ids[0]!;
  const other = memberName(group, otherId);
  if (!direction) {
    return {
      kind: "clarify",
      text: "Which way did the money go?",
      choices: [
        { label: `${other} paid you`, hints: { ...ctx.hints, groupId: group.id, direction: "they_paid_me" } },
        { label: `You paid ${other}`, hints: { ...ctx.hints, groupId: group.id, direction: "i_paid_them" } },
      ],
    };
  }
  const owed = pairwiseBalance(group, otherId);
  const stated = currencyFromWords(c.currency, ctx.text);
  let currency: CurrencyCode = stated ?? group.currency;
  if (!stated) {
    const open = [...owed.keys()];
    if (open.length === 1) currency = open[0]!;
    else if (open.length > 1) {
      return {
        kind: "clarify",
        text: `You and ${other} have balances in ${open.join(" and ")}. Which currency was the payment in? Say it with the amount, like "${open[1]} 20".`,
        choices: [],
      };
    }
  }
  const amountMinor = amountFromText(c.amount, ctx.text, currency);
  if (amountMinor === null) return askAmount(ctx, "the payment");
  const me = group.myMemberId!;
  const from = direction === "they_paid_me" ? otherId : me;
  const to = direction === "they_paid_me" ? me : otherId;
  const outstanding = owed.get(currency) ?? 0; // + = they owe me
  const relevant = direction === "they_paid_me" ? outstanding : -outstanding;
  const lines: PreviewLine[] = [
    { label: "From", value: memberName(group, from) },
    { label: "To", value: memberName(group, to) },
    { label: "Amount", value: money(amountMinor, currency) },
    { label: "Group", value: groupLabel(group) },
  ];
  if (relevant <= 0) lines.push({ label: "Note", value: `Nothing is owed this way in ${currency} right now — this will put ${direction === "they_paid_me" ? other : "you"} ahead.` });
  else if (amountMinor > relevant) lines.push({ label: "Note", value: `More than the ${money(relevant, currency)} owed.` });
  else lines.push({ label: "Owed now", value: money(relevant, currency) });
  return {
    kind: "propose",
    text: "Record this payment?",
    proposal: {
      id: ctx.newId(),
      risk: "consequential",
      title: "Record payment",
      lines,
      action: { type: "record_payment", groupId: group.id, fromMemberId: from, toMemberId: to, amountMinor, currency },
      requiresConnection: false,
    },
    focus: { groupId: group.id, memberIds: [otherId] },
  };
}

// ---------------------------------------------------------------------------
// Groups and members
// ---------------------------------------------------------------------------

function guestGroupRefusal(): AssistantPlan {
  return {
    kind: "refuse",
    text: "Groups, friends and payments need an account so the other people can see them. Your own expenses work without one.",
    route: { screen: "sign_in" },
  };
}

function createGroup(ctx: Ctx): AssistantPlan {
  if (ctx.snapshot.isGuest) return guestGroupRefusal();
  const c = ctx.command;
  const rawName = c.newName ?? c.groupName;
  const name = rawName && textMentions(ctx.text, rawName.split(" ").find((w) => !/^(our|the|my|a|for)$/i.test(w)) ?? rawName) ? rawName.trim() : null;
  if (!name) return { kind: "clarify", text: "What should the group be called?", choices: [] };
  const memberNames = mentioned(ctx, c.participantNames)
    .filter((n) => !isSelfWord(n))
    .map((n) => capitalize(n.trim()));
  const currency = currencyFromWords(c.currency, ctx.text) ?? ctx.snapshot.defaultCurrency;
  return {
    kind: "propose",
    text: "Create this group?",
    proposal: {
      id: ctx.newId(),
      risk: "write",
      title: "Create group",
      lines: [
        { label: "Name", value: name },
        { label: "Currency", value: currency },
        { label: "People", value: memberNames.length ? `You, ${memberNames.join(", ")}` : "Just you for now" },
      ],
      action: { type: "create_group", name, currency, memberNames },
      requiresConnection: true,
    },
  };
}

function addMember(ctx: Ctx): AssistantPlan {
  if (ctx.snapshot.isGuest) return guestGroupRefusal();
  const scope = resolveGroupScope({ ...ctx, command: { ...ctx.command, participantNames: [], personName: null, payerName: null, splitDetails: [] } }, { allowPersonal: false, purpose: "should they join" });
  if (scope.kind === "plan") return scope.plan;
  if (scope.kind === "personal") return { kind: "clarify", text: "Which group?", choices: groupChoices(activeGroups(ctx.snapshot)) };
  const group = scope.group;
  const names = mentioned(ctx, [...ctx.command.participantNames, ...(ctx.command.personName ? [ctx.command.personName] : [])]).filter((n) => !isSelfWord(n));
  if (names.length === 0) return { kind: "clarify", text: `Who should I add to ${groupLabel(group)}?`, choices: [] };
  const existing = new Set(group.members.map((m) => normalizeName(m.name)));
  const fresh = names.map((n) => capitalize(n.trim())).filter((n) => !existing.has(normalizeName(n)));
  if (fresh.length === 0) return { kind: "answer", text: `${names.join(" and ")} ${names.length > 1 ? "are" : "is"} already in ${groupLabel(group)}.` };
  if (group.isDirect) return { kind: "refuse", text: "A friend ledger is just the two of you. Create a group to include more people." };
  return {
    kind: "propose",
    text: `Add ${fresh.join(" and ")} to ${groupLabel(group)}? They can join with an account later.`,
    proposal: {
      id: ctx.newId(),
      risk: "write",
      title: "Add people",
      lines: [
        { label: "Group", value: groupLabel(group) },
        { label: "Adding", value: fresh.join(", ") },
      ],
      action: { type: "add_members", groupId: group.id, names: fresh },
      requiresConnection: true,
    },
    focus: { groupId: group.id },
  };
}

function removeMember(ctx: Ctx): AssistantPlan {
  if (ctx.snapshot.isGuest) return guestGroupRefusal();
  const scope = resolveGroupScope({ ...ctx, command: { ...ctx.command, participantNames: [], personName: null, payerName: null, splitDetails: [] } }, { allowPersonal: false, purpose: "should they leave" });
  if (scope.kind === "plan") return scope.plan;
  if (scope.kind === "personal") return { kind: "clarify", text: "Which group?", choices: groupChoices(activeGroups(ctx.snapshot)) };
  const group = scope.group;
  if (!isAdmin(group)) return { kind: "refuse", text: `Only an owner or admin of ${groupLabel(group)} can remove people.` };
  const names = personNames(ctx);
  if (names.length !== 1) return { kind: "clarify", text: "Who should I remove? One person at a time.", choices: [] };
  const r = resolvePeople(ctx, group, names);
  if (r.kind === "plan") return r.plan;
  const memberId = r.ids[0]!;
  const member = group.members.find((m) => m.id === memberId)!;
  if (member.isMe) return { kind: "refuse", text: "To leave a group yourself, use Leave Group in its settings.", route: { screen: "group_settings", groupId: group.id } };
  const lines: PreviewLine[] = [
    { label: "Remove", value: member.name },
    { label: "From", value: groupLabel(group) },
  ];
  const owed = group.balances?.flatMap((b) => b.net.filter((n) => n.memberId === memberId && n.amountMinor !== 0).map((n) => money(Math.abs(n.amountMinor), b.currency))) ?? [];
  if (owed.length) lines.push({ label: "Note", value: `${member.name} still has a balance (${owed.join(", ")}). Settle it first; the app won't remove someone with a balance.` });
  return {
    kind: "propose",
    text: `Remove ${member.name} from ${groupLabel(group)}?`,
    proposal: {
      id: ctx.newId(),
      risk: "consequential",
      title: "Remove person",
      lines,
      action: { type: "remove_member", groupId: group.id, memberId },
      requiresConnection: true,
    },
    focus: { groupId: group.id },
  };
}

function renameGroup(ctx: Ctx): AssistantPlan {
  if (ctx.snapshot.isGuest) return guestGroupRefusal();
  const c = ctx.command;
  const scope = resolveGroupScope({ ...ctx, command: { ...c, participantNames: [], personName: null, payerName: null, splitDetails: [] } }, { allowPersonal: false, purpose: "should I rename" });
  if (scope.kind === "plan") return scope.plan;
  if (scope.kind === "personal") return { kind: "clarify", text: "Which group?", choices: groupChoices(activeGroups(ctx.snapshot)) };
  const group = scope.group;
  if (!isAdmin(group)) return { kind: "refuse", text: `Only an owner or admin can rename ${groupLabel(group)}.` };
  if (group.isDirect) return { kind: "refuse", text: "Friend ledgers are named after your friend." };
  const name = c.newName && textMentions(ctx.text, c.newName.split(" ")[0] ?? c.newName) ? c.newName.trim() : null;
  if (!name) return { kind: "clarify", text: `What should ${groupLabel(group)} be called?`, choices: [] };
  return {
    kind: "propose",
    text: "Rename the group?",
    proposal: {
      id: ctx.newId(),
      risk: "write",
      title: "Rename group",
      lines: [{ label: "Name", before: group.name, value: name }],
      action: { type: "rename_group", groupId: group.id, name },
      requiresConnection: true,
    },
    focus: { groupId: group.id },
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function queryBalance(ctx: Ctx): AssistantPlan | LoadRequest {
  if (ctx.snapshot.isGuest) return guestGroupRefusal();
  const people = personNames(ctx);
  const groups = activeGroups(ctx.snapshot);
  if (people.length > 0) {
    const name = people[0]!;
    const named = ctx.command.groupName ? matchGroups(ctx.command.groupName, groups) : [];
    const pool = named.length === 1 ? named : groups;
    const byGroup = new Map<string, string>();
    for (const group of pool) {
      const hinted = ctx.hints.memberIds?.[name];
      if (hinted && group.members.some((m) => m.id === hinted)) {
        byGroup.set(group.id, hinted);
        continue;
      }
      const match = matchMember(name, asMembers(group));
      if (match.kind === "match" && match.id !== group.myMemberId) byGroup.set(group.id, match.id);
      if (match.kind === "ambiguous") {
        return {
          kind: "clarify",
          text: `Which ${capitalize(name)} in ${groupLabel(group)}?`,
          choices: match.candidates.slice(0, MAX_CHOICES).map((m) => ({ label: m.name, hints: { ...ctx.hints, memberIds: { ...(ctx.hints.memberIds ?? {}), [name]: m.id } } })),
        };
      }
    }
    if (byGroup.size === 0) return { kind: "answer", text: `I don't see ${capitalize(name)} in your groups.` };
    const unloaded = [...byGroup.keys()].filter((id) => !pool.find((g) => g.id === id)?.balances);
    if (unloaded.length && ctx.snapshot.online) return { kind: "load", groupIds: unloaded };
    const label = capitalize(name);
    const answer = balanceWithPerson(ctx.snapshot, label, byGroup);
    return { kind: "answer", ...answer, focus: { memberIds: [...byGroup.values()] } };
  }
  const named = ctx.command.groupName ? matchGroups(ctx.command.groupName, groups) : [];
  if (named.length > 1) return { kind: "clarify", text: "Which group?", choices: groupChoices(named) };
  const group = named[0] ?? (ctx.hints.groupId ? groups.find((g) => g.id === ctx.hints.groupId) : undefined);
  if (group) {
    if (!group.balances && ctx.snapshot.online) return { kind: "load", groupIds: [group.id] };
    return { kind: "answer", ...groupBalances(group), focus: { groupId: group.id } };
  }
  const unloaded = groups.filter((g) => !g.balances).map((g) => g.id);
  if (unloaded.length && ctx.snapshot.online) return { kind: "load", groupIds: unloaded };
  return { kind: "answer", ...balanceOverview(ctx.snapshot) };
}

function wantsPersonal(ctx: Ctx): boolean {
  if (ctx.snapshot.isGuest) return true;
  if (ctx.hints.personal) return true;
  if (ctx.command.groupName) return false;
  if (/\b(we|us|our|group|natin|namin|tayo)\b/i.test(ctx.text)) return false;
  return (
    (/\b(i|my|ako|ko)\b/i.test(ctx.text) && /\b(spend|spent|spending|gastos|ginastos)\b/i.test(ctx.text)) ||
    /\b(my|personal)\s+(recent\s+)?(expenses|spending|purchases)\b/i.test(ctx.text)
  );
}

function spendingScope(ctx: Ctx): { kind: "groups"; groups: SnapshotGroup[] } | { kind: "plan"; plan: AssistantPlan } {
  const groups = activeGroups(ctx.snapshot);
  if (ctx.hints.groupId) {
    const g = groups.find((x) => x.id === ctx.hints.groupId);
    if (g) return { kind: "groups", groups: [g] };
  }
  if (ctx.command.groupName) {
    const matches = matchGroups(ctx.command.groupName, groups);
    if (matches.length === 1) return { kind: "groups", groups: matches };
    if (matches.length > 1) return { kind: "plan", plan: { kind: "clarify", text: "Which group?", choices: groupChoices(matches) } };
    return { kind: "plan", plan: { kind: "clarify", text: `I couldn't find a group called "${ctx.command.groupName}". Which one?`, choices: groupChoices(groups) } };
  }
  const focus = groups.find((g) => g.id === ctx.focus.groupId);
  if (focus && /\b(we|us|our|that|this|the trip|natin|namin)\b/i.test(ctx.text)) return { kind: "groups", groups: [focus] };
  return { kind: "groups", groups };
}

function querySpending(ctx: Ctx): AssistantPlan | LoadRequest {
  const c = ctx.command;
  const range = rangeFromMention(c.dateMention, ctx.snapshot.today);
  if (wantsPersonal(ctx)) {
    const items = ctx.snapshot.personal.filter((e) => !range || (e.date >= range.from && e.date <= range.to));
    const totals = new Map<CurrencyCode, number>();
    const byCategory = new Map<string, number>();
    for (const e of items) {
      totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amountMinor);
      byCategory.set(`${e.category}|${e.currency}`, (byCategory.get(`${e.category}|${e.currency}`) ?? 0) + e.amountMinor);
    }
    const when = range ? ` ${range.label}` : "";
    if (c.queryKind === "largest") {
      const top = [...items].sort((a, b) => b.amountMinor - a.amountMinor)[0];
      if (!top) return { kind: "answer", text: `You have no personal expenses${when}.` };
      return { kind: "answer", text: `Your largest personal expense${when} was ${top.description}, ${money(top.amountMinor, top.currency)} on ${top.date}.`, focus: { personalExpenseIds: [top.id] } };
    }
    return {
      kind: "answer",
      text: items.length ? `You spent ${moneyList(totals)}${when} across ${items.length} expense${items.length === 1 ? "" : "s"}.` : `You have no personal expenses${when}.`,
      card: {
        type: "totals",
        title: `By category${when}`,
        rows: [...byCategory.entries()]
          .map(([key, amountMinor]) => {
            const [category, currency] = key.split("|") as [string, CurrencyCode];
            return { label: capitalize(category.replace(/-/g, " & ")), amountMinor, currency };
          })
          .sort((a, b) => b.amountMinor - a.amountMinor),
      },
      focus: { personalExpenseIds: items.slice(0, 20).map((e) => e.id) },
    };
  }
  const scope = spendingScope(ctx);
  if (scope.kind === "plan") return scope.plan;
  const incomplete = scope.groups.filter((g) => !g.expensesComplete).map((g) => g.id);
  if (incomplete.length && ctx.snapshot.online) return { kind: "load", groupIds: incomplete };
  const note = incomplete.length ? " (offline: based on the expenses saved on this iPhone)" : "";
  const items = scopedExpenses({ groups: scope.groups, range, search: c.searchText });
  const where = scope.groups.length === 1 ? groupLabel(scope.groups[0]!) : "your groups";
  const when = range ? ` ${range.label}` : "";
  const groupFocus = scope.groups.length === 1 ? scope.groups[0]!.id : null;
  if (c.queryKind === "largest") {
    const top = [...items].sort((a, b) => b.expense.amountMinor - a.expense.amountMinor)[0];
    if (!top) return { kind: "answer", text: `No expenses in ${where}${when}.` };
    return {
      kind: "answer",
      text: `The largest was ${top.expense.description}: ${money(top.expense.amountMinor, top.expense.currency)} on ${top.expense.date}${scope.groups.length > 1 ? ` in ${groupLabel(top.group)}` : ""}.${note}`,
      card: { type: "expenses", title: "Largest expense", rows: expenseRows([top]) },
      focus: { groupId: top.group.id, expenseIds: [top.expense.id] },
    };
  }
  if (c.queryKind === "top_payer") {
    if (scope.groups.length !== 1) return { kind: "clarify", text: "For which group?", choices: groupChoices(scope.groups) };
    const rows = topPayers(scope.groups[0]!, items);
    if (!rows.length) return { kind: "answer", text: `No expenses in ${where}${when}.` };
    return {
      kind: "answer",
      text: `${rows[0]!.label} paid the most${when}: ${money(rows[0]!.amountMinor, rows[0]!.currency)}.${note}`,
      card: { type: "totals", title: `Paid in ${where}${when}`, rows },
      focus: { groupId: groupFocus },
    };
  }
  const totals = spendingTotals(items);
  return {
    kind: "answer",
    text: items.length ? `${capitalize(where)} ${scope.groups.length === 1 ? "has" : "have"} ${moneyList(totals)} in recorded expenses${when} (${items.length} expense${items.length === 1 ? "" : "s"}).${note}` : `No expenses in ${where}${when}.`,
    card: { type: "expenses", title: `Recent in ${where}`, rows: expenseRows(items, 5) },
    focus: { groupId: groupFocus, expenseIds: items.slice(0, 5).map((i) => i.expense.id) },
  };
}

function queryExpenses(ctx: Ctx): AssistantPlan | LoadRequest {
  if (/\b(unsettled|outstanding|unpaid|hindi pa bayad|di pa bayad|owe|utang)\b/i.test(ctx.text)) {
    const r = queryBalance(ctx);
    if (r.kind === "answer") return { ...r, text: `Expenses themselves don't get "settled" — balances do. ${r.text}` };
    return r;
  }
  if (wantsPersonal(ctx)) {
    const range = rangeFromMention(ctx.command.dateMention, ctx.snapshot.today);
    const needle = ctx.command.searchText?.toLowerCase() ?? "";
    const items = ctx.snapshot.personal
      .filter((e) => (!range || (e.date >= range.from && e.date <= range.to)) && (!needle || e.description.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date));
    return {
      kind: "answer",
      text: items.length ? `Found ${items.length} personal expense${items.length === 1 ? "" : "s"}.` : "No personal expenses match.",
      card: { type: "expenses", title: "Your expenses", rows: items.slice(0, 8).map((e) => ({ expenseId: e.id, groupId: null, label: e.description, sub: e.date, amountMinor: e.amountMinor, currency: e.currency })) },
      focus: { personalExpenseIds: items.slice(0, 8).map((e) => e.id) },
    };
  }
  const scope = spendingScope(ctx);
  if (scope.kind === "plan") return scope.plan;
  const incomplete = scope.groups.filter((g) => !g.expensesComplete).map((g) => g.id);
  if (incomplete.length && ctx.snapshot.online) return { kind: "load", groupIds: incomplete };
  const range = rangeFromMention(ctx.command.dateMention, ctx.snapshot.today);
  const people = personNames(ctx);
  let memberIdByGroup: Map<string, string> | undefined;
  if (people.length) {
    memberIdByGroup = new Map();
    for (const g of scope.groups) {
      const m = matchMember(people[0]!, asMembers(g));
      if (m.kind === "match") memberIdByGroup.set(g.id, m.id);
    }
  }
  const groups = memberIdByGroup ? scope.groups.filter((g) => memberIdByGroup!.has(g.id)) : scope.groups;
  const items = scopedExpenses({ groups, range, search: ctx.command.searchText, memberIdByGroup });
  return {
    kind: "answer",
    text: items.length ? `Found ${items.length} expense${items.length === 1 ? "" : "s"}${items.length > 8 ? "; here are the latest 8" : ""}.` : "No expenses match.",
    card: { type: "expenses", title: "Expenses", rows: expenseRows(items) },
    focus: { expenseIds: items.slice(0, 8).map((i) => i.expense.id), groupId: groups.length === 1 ? groups[0]!.id : ctx.focus.groupId },
  };
}

export const HELP_TEXT =
  "I can add expenses (\"I paid 2,500 for dinner with Ana and Ben\"), split them by %, shares or amounts, change or delete them, record payments (\"Ben paid me 500\"), create groups and add people, and answer questions like \"How much does Ana owe me?\" or \"Who spent the most on our trip?\". I'll always show you what will change before saving.";

/** Deterministic plan for one interpreted turn. */
// ---------------------------------------------------------------------------
// Enrichment: deterministic reading of names the user's own data contains, so
// a missed slot from the interpreter does not turn a shared expense into a
// personal one. Only names that exist in the snapshot are ever added.
// ---------------------------------------------------------------------------

const COMMON_WORDS = new Set(["dinner", "lunch", "breakfast", "food", "coffee", "trip", "group", "house", "home", "office", "team", "family", "rent", "bills", "travel"]);
const PRONOUNS = /^(he|she|him|her|they|them|siya|sya|niya|nya)$/i;

/** The single active group whose distinctive name word appears in the text. */
export function detectGroupName(text: string, snapshot: AssistantSnapshot): string | null {
  const words = new Set(normalizeName(text).split(" "));
  const hits = activeGroups(snapshot).filter((g) => {
    if (g.isDirect) return false;
    const tokens = normalizeName(g.name).split(" ").filter((t) => t.length >= 4 && !COMMON_WORDS.has(t) && !/^\d+$/.test(t));
    return tokens.length > 0 && tokens.some((t) => words.has(t));
  });
  return hits.length === 1 ? hits[0]!.name : null;
}

/** Capitalised first names of people in the user's groups that appear in the text. */
export function detectPeople(text: string, snapshot: AssistantSnapshot): string[] {
  const found: string[] = [];
  const names = new Set<string>();
  for (const g of activeGroups(snapshot)) for (const m of g.members) if (!m.isMe) names.add(m.name.split(" ")[0]!);
  for (const first of names) {
    if (first.length < 3) continue;
    const pattern = new RegExp(`(^|[^\\p{L}])${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u");
    if (pattern.test(text) && !found.includes(first)) found.push(first);
  }
  return found;
}

const EVERYONE = /\b(everyone|everybody|all of us|all \d+ of us|lahat|tayong lahat|kaming lahat|the group|whole group|the (two|three|four|five|six|seven|eight) of us)\b/i;

const EDIT_CUE = /\b(actually|instead|should be|should have been|was really|correction|make the|change the|update the|fix the|palitan)\b/i;

/** A distinctive word from an existing expense's description, if the text names one. */
function mentionedExpense(text: string, snapshot: AssistantSnapshot): string | null {
  const words = new Set(normalizeName(text).split(" "));
  for (const g of activeGroups(snapshot)) {
    for (const e of g.expenses ?? []) {
      const hit = normalizeName(e.description)
        .split(" ")
        .find((w) => w.length >= 4 && words.has(w));
      if (hit) return hit;
    }
  }
  return null;
}

/** Direction of a payment described in the text, or null when it is not one. */
export function paymentDirection(text: string): "they_paid_me" | "i_paid_them" | null {
  // A purpose ("for dinner") makes it an expense, except "for what I owed".
  if (/\bfor\s+(?!what i owed|my share|my part|the balance)/i.test(text)) return null;
  if (/\b(sent me|gave me|paid me|transferred me|got [^.]*?\bfrom\b|received [^.]*?\bfrom\b|natanggap ko|binayaran ako|nagbayad na si|bayad na si|(she|he|they) (sent|paid|gave)|settled up with)\b/i.test(text)) return "they_paid_me";
  if (/\b(i sent|i gave|i transferred|i paid \w+ back|nag-?send ako|nagpadala ako|binayaran ko si|nagbayad ako kay)\b/i.test(text)) return "i_paid_them";
  return null;
}

function enrich(
  command: AssistantCommand,
  text: string,
  snapshot: AssistantSnapshot,
  focus: AssistantFocus,
  pronounNames: Set<string>,
): AssistantCommand {
  const c = { ...command };
  // The date phrase the user typed, even if the interpreter left it out.
  if (!c.dateMention) c.dateMention = dateOf(text);
  // "Everyone" only when the user said so.
  if (c.everyone && !EVERYONE.test(text)) c.everyone = false;
  c.groupName = meaningfulGroupName(c.groupName) ?? (snapshot.isGuest ? null : detectGroupName(text, snapshot));
  // "she paid me" → the person the conversation is about.
  const focusNames = new Set(
    snapshot.groups.flatMap((g) => g.members.filter((m) => !m.isMe && focus.memberIds.includes(m.id)).map((m) => m.name)),
  );
  const focusPerson = focusNames.size === 1 ? [...focusNames][0]! : null;
  if (focusPerson) pronounNames.add(normalizeName(focusPerson));
  const pronoun = (name: string | null): string | null => (name && PRONOUNS.test(name.trim()) && focusPerson ? focusPerson : name);
  c.personName = pronoun(c.personName);
  c.payerName = pronoun(c.payerName);
  c.participantNames = c.participantNames.map((n) => pronoun(n) ?? n);
  if (!c.personName && focusPerson && /\b(she|he|siya|sya)\b/i.test(text) && (c.action === "record_payment" || c.action === "query_balance")) c.personName = focusPerson;
  if (snapshot.isGuest) return c;
  const people = detectPeople(text, snapshot);

  // "The Grab ride was actually 520", "make the dinner a 3-way split": an
  // existing expense named with a correction cue is an edit, not a new one.
  if (c.action === "add_expense" && EDIT_CUE.test(text)) {
    const named = mentionedExpense(text, snapshot);
    if (named) {
      c.action = "edit_expense";
      c.targetReference = named;
    }
  }
  // Money moving between two people, not a purchase.
  if (c.action === "add_expense" || c.action === "unsupported") {
    const direction = paymentDirection(text);
    if (direction) {
      c.action = "record_payment";
      c.direction = direction;
      if (!c.personName && people.length === 1) c.personName = people[0]!;
    }
  }
  // "Mark paid …", "si Mark nagbayad": the payer is in the text even if the interpreter missed it.
  if (c.action === "add_expense" && !c.payerName) {
    const payer = people.find((p) => new RegExp(`\\b${p}\\s+(paid|covered|bought|nagbayad|bumili)\\b|\\bsi\\s+${p}\\s+(ang\\s+)?(nagbayad|bumili)\\b`, "i").test(text));
    if (payer) c.payerName = payer;
  }
  const owesMe = /\bowes? me\b|\butang (ni|sa akin ni)\b/i.test(text);
  if (c.action === "add_expense") {
    if (owesMe && c.direction === "none") c.direction = "they_owe_me";
    const known = [c.payerName, c.personName, ...c.participantNames, ...c.excludedNames].filter((n): n is string => Boolean(n)).map((n) => normalizeName(n));
    const missing = people.filter((p) => !known.some((k) => k === normalizeName(p) || k.startsWith(`${normalizeName(p)} `)));
    if (missing.length && !c.everyone && c.splitDetails.length === 0) {
      if (c.direction === "they_owe_me" && !c.personName) c.personName = missing[0]!;
      else c.participantNames = [...c.participantNames, ...missing.filter((p) => normalizeName(p) !== normalizeName(c.payerName ?? ""))];
    }
  }
  if ((c.action === "record_payment" || c.action === "query_balance") && !c.personName && c.participantNames.length === 0 && people.length === 1) {
    c.personName = people[0]!;
  }
  return c;
}

const READ_ACTIONS = new Set<AssistantCommand["action"]>(["query_balance", "query_spending", "query_expenses"]);

/** Reads say when queued changes are not in the numbers yet. */
function withPendingNote(plan: AssistantPlan | LoadRequest, snapshot: AssistantSnapshot): AssistantPlan | LoadRequest {
  const pending = snapshot.pendingWrites ?? 0;
  if (plan.kind !== "answer" || pending === 0) return plan;
  return { ...plan, text: `${plan.text} ${pending} change${pending === 1 ? " is" : "s are"} still waiting to sync and ${pending === 1 ? "isn't" : "aren't"} included.` };
}

export function resolveCommand(input: ResolveInput): AssistantPlan | LoadRequest {
  const plan = resolveCommandInner(input);
  return READ_ACTIONS.has(input.command.action) ? withPendingNote(plan, input.snapshot) : plan;
}

function resolveCommandInner(input: ResolveInput): AssistantPlan | LoadRequest {
  // "our trip" / "the group" name nothing: fall back to the focused group.
  const pronounNames = new Set<string>();
  const base = input.receipt && input.command.action !== "add_expense" ? { ...input.command, action: "add_expense" as const } : input.command;
  const command = enrich(base, input.text, input.snapshot, input.focus, pronounNames);
  // Only allow the pronoun's person when a pronoun was actually used.
  if (!/\b(he|she|him|her|they|them|siya|sya|niya|nya)\b/i.test(input.text)) pronounNames.clear();
  const ctx: Ctx = { ...input, command, hints: input.hints ?? {}, pronounNames };
  switch (command.action) {
    case "add_expense":
      return addExpense(ctx);
    case "edit_expense":
      return editExpense(ctx);
    case "delete_expense":
      return deleteExpense(ctx);
    case "record_payment":
      return recordPayment(ctx);
    case "create_group":
      return createGroup(ctx);
    case "add_member":
      return addMember(ctx);
    case "remove_member":
      return removeMember(ctx);
    case "rename_group":
      return renameGroup(ctx);
    case "query_balance":
      return queryBalance(ctx);
    case "query_spending":
      return querySpending(ctx);
    case "query_expenses":
      return queryExpenses(ctx);
    case "share_group": {
      if (ctx.snapshot.isGuest) return guestGroupRefusal();
      const scope = resolveGroupScope(ctx, { allowPersonal: false, purpose: "do you want to share" });
      if (scope.kind === "plan") return scope.plan;
      if (scope.kind === "personal") return { kind: "clarify", text: "Which group?", choices: groupChoices(activeGroups(ctx.snapshot)) };
      return {
        kind: "navigate",
        text: `Opening ${groupLabel(scope.group)}'s shared link settings. You choose what to share there.`,
        route: { screen: "share_group", groupId: scope.group.id },
      };
    }
    case "open_settings":
      if (/\b(payment|gcash|maya|bank|qr|account number)\b/i.test(input.text)) {
        return input.snapshot.isGuest
          ? guestGroupRefusal()
          : { kind: "navigate", text: "Opening your payment details.", route: { screen: "payment_details" } };
      }
      return { kind: "navigate", text: "Opening Account.", route: { screen: "account" } };
    case "help":
      return { kind: "answer", text: HELP_TEXT };
    default:
      return {
        kind: "refuse",
        text: "I can't do that here. I can add, change or delete expenses, record payments, manage groups, and answer questions about balances and spending.",
      };
  }
}

export function isLoadRequest(value: AssistantPlan | LoadRequest): value is LoadRequest {
  return value.kind === "load";
}

/** Applies a plan's focus onto the conversation's focus. */
export function nextFocus(focus: AssistantFocus, plan: AssistantPlan): AssistantFocus {
  if (!("focus" in plan) || !plan.focus) return focus;
  return {
    groupId: plan.focus.groupId !== undefined ? plan.focus.groupId : focus.groupId,
    expenseIds: plan.focus.expenseIds ?? focus.expenseIds,
    personalExpenseIds: plan.focus.personalExpenseIds ?? focus.personalExpenseIds,
    memberIds: plan.focus.memberIds ?? focus.memberIds,
  };
}

export type { ProposalAction };

// ---------------------------------------------------------------------------
// Follow-ups: "2,400" after "How much was dinner?", "make it 1,200" before
// confirming. The previous request is continued with the new words; the
// combined text is what amounts and names are checked against.
// ---------------------------------------------------------------------------

export type PendingTurn = { command: AssistantCommand; text: string };

const CONTINUABLE = new Set<AssistantCommand["action"]>(["add_expense", "edit_expense", "record_payment", "create_group", "add_member", "rename_group"]);

export function mergeFollowUp(
  pending: PendingTurn | null,
  command: AssistantCommand,
  text: string,
): { command: AssistantCommand; text: string; merged: boolean } {
  if (!pending) return { command, text, merged: false };
  const words = text.trim().split(/\s+/).length;
  const refersBack = !command.targetReference || REFERENCE_WORDS.test(command.targetReference.trim());
  const fill =
    words <= 8 &&
    (command.action === "unsupported" ||
      command.action === pending.command.action ||
      (command.action === "edit_expense" && refersBack && pending.command.action !== "edit_expense") ||
      (command.action === "add_expense" && !command.description && pending.command.action === "add_expense"));
  if (!fill) return { command, text, merged: false };
  const merged: AssistantCommand = { ...pending.command };
  const tokens = numberTokens(text);
  if (command.amount > 0) merged.amount = command.amount;
  else if (tokens.length === 1 && (pending.command.amount === 0 || /\b(make it|change it|actually|instead|i mean|pala|gawin mong)\b/i.test(text))) {
    merged.amount = tokens[0]!.value;
  }
  if (command.dateMention) merged.dateMention = command.dateMention;
  if (command.currency) merged.currency = command.currency;
  if (command.groupName) merged.groupName = command.groupName;
  if (command.participantNames.length) merged.participantNames = command.participantNames;
  if (command.excludedNames.length) merged.excludedNames = command.excludedNames;
  if (command.everyone) merged.everyone = true;
  if (command.payerName) merged.payerName = command.payerName;
  if (command.personName) merged.personName = command.personName;
  if (command.splitMode !== "unspecified") {
    merged.splitMode = command.splitMode;
    merged.splitDetails = command.splitDetails;
  }
  if (command.newName) merged.newName = command.newName;
  if (command.description && command.action === pending.command.action) merged.description = command.description;
  else if (!pending.command.description && tokens.length === 0 && words <= 4 && pending.command.action === "add_expense") {
    merged.description = text.trim().replace(/^(for|sa|para sa)\s+/i, "").replace(/[.!?]$/, "");
  }
  return { command: merged, text: `${pending.text}\n${text}`, merged: true };
}

/** What a follow-up may continue: unanswered questions and unconfirmed previews. */
export function pendingAfter(plan: AssistantPlan | LoadRequest, command: AssistantCommand, text: string): PendingTurn | null {
  if ((plan.kind === "clarify" || plan.kind === "propose") && CONTINUABLE.has(command.action)) return { command, text };
  return null;
}
