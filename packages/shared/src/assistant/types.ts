import type { CurrencyCode } from "../utils/currency";
import type { CategorySlug } from "../utils/category";
import type { SplitMode, SplitShare } from "../utils/split-resolve";

// ---------------------------------------------------------------------------
// What the assistant knows (a snapshot built from the app's own cached
// queries) and what it decides (a plan). Nothing here reaches the model: the
// model only ever sees names via `buildModelContext`.
// ---------------------------------------------------------------------------

export type SnapshotMember = {
  id: string;
  name: string;
  isMe: boolean;
  hasAccount: boolean;
  /** The Talli account behind the member, if any: the only proof two groups' "Carla" are one person. */
  userId?: string | null;
};

export type SnapshotExpense = {
  id: string;
  groupId: string;
  description: string;
  amountMinor: number;
  currency: CurrencyCode;
  date: string;
  createdAt: string;
  updatedAt: string;
  createdByMe: boolean;
  itemized: boolean;
  /** Kept on edits: the update RPC clears a category or note it is not sent. */
  categoryId: string | null;
  notes: string | null;
  payers: { memberId: string; amountMinor: number }[];
  shares: SplitShare[];
  /** Still in the offline queue; not yet on the server. */
  pending?: boolean;
};

export type SnapshotBalance = {
  currency: CurrencyCode;
  /** Net per member: positive = is owed, negative = owes. Sums to zero. */
  net: { memberId: string; amountMinor: number }[];
};

export type SnapshotGroup = {
  id: string;
  name: string;
  currency: CurrencyCode;
  /** Two-person friend ledger. */
  isDirect: boolean;
  /** Friend's name for direct ledgers. */
  friendName: string | null;
  myMemberId: string | null;
  myRole: "owner" | "admin" | "member" | null;
  archived: boolean;
  members: SnapshotMember[];
  /** Loaded expenses, newest first; may be a partial page. */
  expenses: SnapshotExpense[] | null;
  expensesComplete: boolean;
  balances: SnapshotBalance[] | null;
};

export type SnapshotPersonalExpense = {
  id: string;
  description: string;
  amountMinor: number;
  currency: CurrencyCode;
  date: string;
  category: CategorySlug;
};

export type AssistantSnapshot = {
  today: string;
  isGuest: boolean;
  online: boolean;
  myName: string | null;
  defaultCurrency: CurrencyCode;
  groups: SnapshotGroup[];
  personal: SnapshotPersonalExpense[];
  /** Group changes still in the offline queue (not in balances or totals yet). */
  pendingWrites?: number;
};

/** Ids the conversation is "about" — resolves "that", "it", "the dinner". */
export type AssistantFocus = {
  groupId: string | null;
  expenseIds: string[];
  personalExpenseIds: string[];
  memberIds: string[];
};

export const EMPTY_FOCUS: AssistantFocus = {
  groupId: null,
  expenseIds: [],
  personalExpenseIds: [],
  memberIds: [],
};

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export type PreviewLine = { label: string; value: string; before?: string };

export type ProposalRisk = "write" | "consequential";

export type GroupExpenseFields = {
  groupId: string;
  description: string;
  amountMinor: number;
  currency: CurrencyCode;
  date: string;
  payerMemberId: string;
  splitMode: SplitMode;
  /** Resolved shares; for equal the server recomputes with the same rule. */
  shares: SplitShare[];
};

export type ProposalAction =
  | ({ type: "add_group_expense" } & GroupExpenseFields)
  | {
      type: "add_personal_expense";
      description: string;
      amountMinor: number;
      currency: CurrencyCode;
      date: string;
      category: CategorySlug;
    }
  | ({
      type: "edit_group_expense";
      expenseId: string;
      expectedUpdatedAt: string;
      /** Payers rescaled to the new amount, as the edit screen does. */
      payers: { memberId: string; amountMinor: number }[];
      categoryId: string | null;
      notes: string | null;
    } & Omit<GroupExpenseFields, "payerMemberId">)
  | { type: "delete_group_expense"; groupId: string; expenseId: string; expectedUpdatedAt: string }
  | {
      type: "record_payment";
      groupId: string;
      fromMemberId: string;
      toMemberId: string;
      amountMinor: number;
      currency: CurrencyCode;
    }
  | { type: "create_group"; name: string; currency: CurrencyCode; memberNames: string[] }
  | { type: "add_members"; groupId: string; names: string[] }
  | { type: "remove_member"; groupId: string; memberId: string }
  | { type: "rename_group"; groupId: string; name: string };

export type Proposal = {
  /** Stable per proposal; also the idempotency key for creates. */
  id: string;
  risk: ProposalRisk;
  title: string;
  lines: PreviewLine[];
  action: ProposalAction;
  /** Shown when the operation cannot run offline. */
  requiresConnection: boolean;
};

export type AnswerCard =
  | { type: "balances"; title: string; rows: { label: string; amountMinor: number; currency: CurrencyCode; sub?: string }[] }
  | { type: "expenses"; title: string; rows: { expenseId: string; groupId: string | null; label: string; sub: string; amountMinor: number; currency: CurrencyCode }[] }
  | { type: "totals"; title: string; rows: { label: string; amountMinor: number; currency: CurrencyCode }[] };

/**
 * Choices the user taps resolve ambiguity with ids the app offered. The model
 * can never set these: they are not part of AssistantCommand.
 */
export type AssistantHints = {
  groupId?: string;
  expenseId?: string;
  personalExpenseId?: string;
  /** name as written → chosen member id */
  memberIds?: Record<string, string>;
  payerMemberId?: string;
  /** Member who pays the first stated percentage/share when names were not given. */
  firstShareMemberId?: string;
  direction?: "they_paid_me" | "i_paid_them";
  personal?: boolean;
};

export type ClarifyChoice = { label: string; hints: AssistantHints };

export type AssistantPlan =
  | { kind: "answer"; text: string; card?: AnswerCard; focus?: Partial<AssistantFocus> }
  | { kind: "clarify"; text: string; choices: ClarifyChoice[]; focus?: Partial<AssistantFocus> }
  | { kind: "propose"; text: string; proposal: Proposal; focus?: Partial<AssistantFocus> }
  | { kind: "navigate"; text: string; route: AssistantRoute; focus?: Partial<AssistantFocus> }
  | { kind: "refuse"; text: string; route?: AssistantRoute };

export type AssistantRoute =
  | { screen: "group"; groupId: string }
  | { screen: "group_settings"; groupId: string }
  | { screen: "share_group"; groupId: string }
  | { screen: "payment_details" }
  | { screen: "account" }
  | { screen: "sign_in" }
  | { screen: "new_group" }
  | { screen: "add_friend" };
