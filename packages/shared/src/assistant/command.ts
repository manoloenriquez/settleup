import { z } from "zod";

// ---------------------------------------------------------------------------
// The one structure the language model (or the rules interpreter) produces per
// user turn. It carries *words*, never ids or computed money: names exactly as
// written, the amount exactly as stated, date phrases as typed. Everything
// after this point is deterministic code (resolve.ts).
//
// Must stay in sync with `AssistantCommand` in
// apps/mobile/modules/apple-intelligence/ios/Core/AssistantIntelligence.swift.
// ---------------------------------------------------------------------------

export const ASSISTANT_ACTIONS = [
  "add_expense",
  "edit_expense",
  "delete_expense",
  "record_payment",
  "create_group",
  "add_member",
  "remove_member",
  "rename_group",
  "query_balance",
  "query_expenses",
  "query_spending",
  "share_group",
  "open_settings",
  "help",
  "unsupported",
] as const;
export type AssistantAction = (typeof ASSISTANT_ACTIONS)[number];

export const ASSISTANT_QUERY_KINDS = [
  "none",
  "total",
  "largest",
  "top_payer",
  "by_category",
  "list",
  "recent",
] as const;
export type AssistantQueryKind = (typeof ASSISTANT_QUERY_KINDS)[number];

export const ASSISTANT_SPLIT_MODES = ["unspecified", "equal", "percent", "shares", "fixed"] as const;

/** Who paid whom, for payments and "X owes me" statements. */
export const ASSISTANT_DIRECTIONS = ["none", "they_paid_me", "i_paid_them", "they_owe_me", "i_owe_them"] as const;
export type AssistantDirection = (typeof ASSISTANT_DIRECTIONS)[number];

// Swift omits nil optionals; the rules interpreter may leave fields unset.
const optionalText = z
  .string()
  .nullish()
  .transform((value) => (value && value.trim() ? value.trim() : null));
const textList = z
  .array(z.string())
  .nullish()
  .transform((list) => (list ?? []).map((s) => s.trim()).filter((s) => s.length > 0));

export const assistantSplitShareSchema = z.object({
  name: z.string().trim().min(1),
  percent: z.number().nullish().transform((v) => v ?? null),
  fixedAmount: z.number().nullish().transform((v) => v ?? null),
  weight: z.number().nullish().transform((v) => v ?? null),
});
export type AssistantSplitShare = z.infer<typeof assistantSplitShareSchema>;

export const assistantCommandSchema = z.object({
  action: z.enum(ASSISTANT_ACTIONS).catch("unsupported"),
  /** Amount exactly as the user stated it, in major units. 0 = none stated. */
  amount: z.number().finite().nonnegative().catch(0).default(0),
  /** Currency the user named (code, symbol or word), or null. */
  currency: optionalText,
  description: optionalText,
  payerName: optionalText,
  participantNames: textList,
  excludedNames: textList,
  /** True for "everyone", "all of us", "the group". */
  everyone: z.boolean().nullish().transform((v) => v ?? false),
  groupName: optionalText,
  /** Counterparty for balances, payments and "owes me". */
  personName: optionalText,
  direction: z.enum(ASSISTANT_DIRECTIONS).catch("none").default("none"),
  splitMode: z.enum(ASSISTANT_SPLIT_MODES).catch("unspecified").default("unspecified"),
  splitDetails: z.array(assistantSplitShareSchema).nullish().transform((v) => v ?? []),
  dateMention: optionalText,
  /** Which existing expense: "that", "it", "yesterday's dinner", "the largest". */
  targetReference: optionalText,
  /** New name for rename_group / create_group. */
  newName: optionalText,
  queryKind: z.enum(ASSISTANT_QUERY_KINDS).catch("none").default("none"),
  /** Free-text search for query_expenses ("grab", "coffee"). */
  searchText: optionalText,
  /** Short friendly sentence; shown only for help/unsupported. */
  reply: optionalText,
});
export type AssistantCommand = z.infer<typeof assistantCommandSchema>;

export function emptyCommand(action: AssistantAction): AssistantCommand {
  return assistantCommandSchema.parse({ action });
}
