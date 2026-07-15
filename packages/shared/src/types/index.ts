// ---------------------------------------------------------------------------
// NOTE: Domain entity types (Profile, Waitlist, UserRole) live in
// @template/supabase — they are generated from the DB schema.
// This file contains only framework-agnostic utility types.
// ---------------------------------------------------------------------------

export * from "./ai";

// ---------------------------------------------------------------------------
// Generic API response wrappers
// ---------------------------------------------------------------------------

export type ApiSuccess<T> = { data: T; error: null };
export type ApiError = { data: null; error: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type PaginatedResponse<T> = {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// ---------------------------------------------------------------------------
// Utility types
// ---------------------------------------------------------------------------

/** Make specific keys required on a type */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/** Make every key optional recursively */
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

// ---------------------------------------------------------------------------
// SettleUp domain types
// ---------------------------------------------------------------------------

export type SimplifiedDebt = {
  from_member_id: string;
  from_display_name: string;
  to_member_id: string;
  to_display_name: string;
  amount_cents: number;
};

export type CreditorPaymentProfile = {
  member_id: string;
  display_name: string;
  gcash_name: string | null;
  gcash_number: string | null;
  gcash_qr_url: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_qr_url: string | null;
  notes: string | null;
};

export type SuggestedSettlement = SimplifiedDebt & {
  creditor_profile: CreditorPaymentProfile | null;
};

export type MemberRole = "owner" | "admin" | "member";

export type ExpenseCategory = {
  id: string;
  group_id: string | null;
  name: string;
  slug: string;
  icon: string;
  color: string;
  sort_order: number;
  is_default: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseCategoryInput = {
  group_id: string;
  name: string;
  icon?: string;
  color?: string;
  sort_order?: number;
};

export type ExpenseCategorySummary = Pick<
  ExpenseCategory,
  "id" | "name" | "slug" | "icon" | "color" | "is_default"
>;

export type CategorySpendingSummary = ExpenseCategorySummary & {
  amount_cents: number;
  expense_count: number;
};

export type MemberBalance = {
  member_id: string;
  display_name: string;
  slug: string;
  share_token: string;
  user_id: string | null;
  role?: MemberRole;
  net_cents: number;
  owed_cents: number;
  is_paid: boolean;
};

export type GroupOverviewPayload = {
  group: { id: string; name: string };
  members: { member_id: string; display_name: string; net_cents: number; owed_cents: number }[];
  expenses: {
    id?: string;
    item_name: string;
    amount_cents: number;
    created_at: string;
    category: ExpenseCategorySummary | null;
    payers?: { member_id: string; display_name: string; paid_cents: number }[];
    participants: { member_id?: string; display_name: string; share_cents: number }[];
    items?: {
      name: string;
      amount_cents: number;
      participants?: { member_id: string; display_name: string; share_cents: number }[];
    }[];
  }[];
  payments?: {
    from_member_id: string;
    from_display_name: string;
    to_member_id: string;
    to_display_name: string;
    amount_cents: number;
    created_at: string;
  }[];
  payment_profile: {
    payer_display_name: string | null;
    gcash_name: string | null;
    gcash_number: string | null;
    gcash_qr_url: string | null;
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_qr_url: string | null;
    notes: string | null;
  } | null;
  creditor_profiles?: CreditorPaymentProfile[];
  error?: string;
};

export type FriendViewPayload = {
  group: { id: string; name: string };
  member: { id: string; display_name: string };
  net_cents: number;
  owed_cents: number;
  payment_profile: {
    payer_display_name: string | null;
    gcash_name: string | null;
    gcash_number: string | null;
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    notes: string | null;
    gcash_qr_url: string | null;
    bank_qr_url: string | null;
  } | null;
  all_balances?: { member_id: string; display_name: string; net_cents: number }[];
  creditor_profiles?: CreditorPaymentProfile[];
  expenses: {
    item_name: string;
    share_cents: number;
    created_at: string;
    category: ExpenseCategorySummary | null;
    items?: { name: string; share_cents: number }[];
  }[];
  error?: string;
};

// Mirrors Database["settleup"]["Tables"]["groups"]["Row"] + computed stats.
// Fields must be kept in sync with database.types.ts if the schema changes.
export type GroupWithStats = {
  id: string;
  name: string;
  owner_user_id: string | null;
  invite_code: string;
  is_archived: boolean;
  share_token: string;
  budget_cents: number | null;
  created_at: string;
  // Computed
  member_count: number;
  pending_count: number;
  total_owed_cents: number;
};

export type DashboardGroupSummary = {
  id: string;
  name: string;
  member_count: number;
  pending_count: number;
  total_owed_cents: number;
  my_net_cents: number;
  created_at: string;
};

export type DashboardSpendPoint = {
  date: string; // YYYY-MM-DD
  amount_cents: number;
};

export type DashboardSummary = {
  net_balance_cents: number;
  total_groups: number;
  total_unsettled_cents: number;
  pending_members: number;
  owed_to_me_cents: number;
  i_owe_cents: number;
  owed_counterparty_count: number;
  owe_counterparty_count: number;
  spend_series: DashboardSpendPoint[];
  groups: DashboardGroupSummary[];
};
