// ---------------------------------------------------------------------------
// NOTE: Domain entity types (Profile, Waitlist, UserRole) live in
// @template/supabase — they are generated from the DB schema.
// This file contains only framework-agnostic utility types.
// ---------------------------------------------------------------------------

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
// SettleUp Lite domain types
// ---------------------------------------------------------------------------

export type MemberBalance = {
  member_id: string;
  display_name: string;
  slug: string;
  share_token: string;
  owed_cents: number;
  is_paid: boolean;
};

export type GroupOverviewPayload = {
  group: { id: string; name: string };
  members: { member_id: string; display_name: string; owed_cents: number }[];
  expenses: {
    item_name: string;
    amount_cents: number;
    created_at: string;
    participants: { display_name: string; share_cents: number }[];
  }[];
  payment_profile: {
    payer_display_name: string | null;
    gcash_name: string | null;
    gcash_number: string | null;
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    notes: string | null;
  } | null;
  error?: string;
};

export type FriendViewPayload = {
  group: { id: string; name: string };
  member: { id: string; display_name: string };
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
  expenses: { item_name: string; share_cents: number; created_at: string }[];
  error?: string;
};
